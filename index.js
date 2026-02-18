/**
 * inSTead - SillyTavern Extension
 * Adds editorial feedback capability to character messages
 */

// Third-party extensions are at /scripts/extensions/third-party/[name]/
// So we need to go up 4 levels to reach /scripts/ for script.js
// And 3 levels up to reach /scripts/ then extensions.js for extensions.js
import { getContext, extension_settings } from '../../../extensions.js';
import { eventSource, event_types, saveChatConditional, reloadCurrentChat, saveSettingsDebounced, generateQuietPrompt, streamingProcessor, messageFormatting } from '../../../../script.js';

const EXTENSION_NAME = 'inSTead';

let isProcessing = false;

/**
 * Add feedback icon to a specific message
 */
function addFeedbackIconToMessage(messageId) {
    try {
        // Validate messageId
        if (messageId === null || messageId === undefined || isNaN(messageId) || messageId < 0) {
            return;
        }

        const context = getContext();
        const chat = context.chat;
        if (!chat || !Array.isArray(chat) || messageId >= chat.length) {
            return;
        }

        const message = chat[messageId];
        if (!message) {
            return;
        }
        
        // Only add to character messages (not user messages)
        if (message.is_user) {
            return;
        }

        const messageElement = document.querySelector(`.mes[mesid="${messageId}"]`);
        if (!messageElement) {
            return;
        }

        // Check if icon already exists
        if (messageElement.querySelector('.instead-feedback-icon')) {
            return;
        }

        // Find the message buttons container - try extraMesButtons first, then mes_buttons
        let buttonsContainer = messageElement.querySelector('.extraMesButtons');
        if (!buttonsContainer) {
            buttonsContainer = messageElement.querySelector('.mes_buttons');
        }
        if (!buttonsContainer) {
            console.debug(`[${EXTENSION_NAME}] No buttons container found for message ${messageId}`);
            return;
        }

        // Create feedback icon button
        const feedbackButton = document.createElement('div');
        feedbackButton.className = 'mes_button instead-feedback-icon interactable';
        feedbackButton.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i>';
        feedbackButton.title = 'Request revision with feedback';
        feedbackButton.setAttribute('data-mesid', messageId);
        feedbackButton.tabIndex = 0;

        // Insert the button at the beginning
        buttonsContainer.insertBefore(feedbackButton, buttonsContainer.firstChild);
        console.debug(`[${EXTENSION_NAME}] Added feedback button to message ${messageId}`);
    } catch (error) {
        console.error(`[${EXTENSION_NAME}] Error adding feedback icon to message ${messageId}:`, error);
    }
}

/**
 * Add feedback icons to all character messages
 */
function addFeedbackIconsToMessages() {
    const context = getContext();
    if (!context.chat || !Array.isArray(context.chat) || context.chat.length === 0) {
        console.debug(`[${EXTENSION_NAME}] No chat loaded yet, skipping...`);
        return;
    }
    
    console.debug(`[${EXTENSION_NAME}] Adding feedback icons to all messages...`);
    const messages = document.querySelectorAll('.mes');
    messages.forEach((messageElement) => {
        const mesidAttr = messageElement.getAttribute('mesid');
        if (mesidAttr !== null && mesidAttr !== '') {
            const messageId = parseInt(mesidAttr, 10);
            if (!isNaN(messageId) && messageId >= 0) {
                addFeedbackIconToMessage(messageId);
                addFeedbackDisplayToMessage(messageId);
            }
        }
    });
}

/**
 * Add feedback display to a revised message
 */
function addFeedbackDisplayToMessage(messageId) {
    try {
        const context = getContext();
        const chat = context.chat;
        if (!chat || !Array.isArray(chat) || messageId >= chat.length) {
            return;
        }

        const message = chat[messageId];
        if (!message) {
            return;
        }

        // Check if this is a revised message with feedback
        const feedback = getFeedbackForCurrentSwipe(message);
        if (!feedback) {
            return;
        }

        const messageElement = document.querySelector(`.mes[mesid="${messageId}"]`);
        if (!messageElement) {
            return;
        }

        // Check if feedback display already exists
        if (messageElement.querySelector('.instead-feedback-display')) {
            return;
        }

        // Find the message text container
        const mesTextParent = messageElement.querySelector('.mes_text')?.parentElement;
        if (!mesTextParent) {
            return;
        }

        // Create feedback display element
        const feedbackDisplay = document.createElement('div');
        feedbackDisplay.className = 'instead-feedback-display';
        feedbackDisplay.innerHTML = `
            <div class="instead-feedback-header" title="Click to expand/collapse">
                <i class="fa-solid fa-comment-dots"></i>
                <span>Revision Feedback</span>
                <i class="fa-solid fa-chevron-down instead-feedback-chevron"></i>
            </div>
            <div class="instead-feedback-content">
                <div class="instead-feedback-text">${escapeHtml(feedback)}</div>
                <button class="instead-feedback-copy menu_button" title="Copy feedback">
                    <i class="fa-solid fa-copy"></i> Copy
                </button>
            </div>
        `;

        // Insert before the message text
        const mesText = messageElement.querySelector('.mes_text');
        if (mesText) {
            mesText.parentElement.insertBefore(feedbackDisplay, mesText);
        }

        // Add toggle functionality
        const header = feedbackDisplay.querySelector('.instead-feedback-header');
        const content = feedbackDisplay.querySelector('.instead-feedback-content');
        const chevron = feedbackDisplay.querySelector('.instead-feedback-chevron');
        
        header.addEventListener('click', () => {
            content.classList.toggle('expanded');
            chevron.classList.toggle('rotated');
        });

        // Add copy functionality
        const copyBtn = feedbackDisplay.querySelector('.instead-feedback-copy');
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(feedback).then(() => {
                toastr.success('Feedback copied to clipboard!');
            }).catch(() => {
                toastr.error('Failed to copy feedback');
            });
        });

        console.debug(`[${EXTENSION_NAME}] Added feedback display to message ${messageId}`);
    } catch (error) {
        console.error(`[${EXTENSION_NAME}] Error adding feedback display to message ${messageId}:`, error);
    }
}

/**
 * Get the feedback for the currently displayed swipe
 */
function getFeedbackForCurrentSwipe(message) {
    // First check swipe_info for the current swipe
    if (message.swipe_id !== undefined && 
        Array.isArray(message.swipe_info) && 
        message.swipe_info[message.swipe_id]?.extra?.instead_feedback) {
        return message.swipe_info[message.swipe_id].extra.instead_feedback;
    }
    
    // Fall back to message.extra
    if (message.extra?.instead_feedback) {
        return message.extra.instead_feedback;
    }
    
    return null;
}

/**
 * Update feedback displays when swipes change
 */
function updateFeedbackDisplays() {
    const context = getContext();
    if (!context.chat || !Array.isArray(context.chat)) {
        return;
    }

    // Remove all existing feedback displays
    document.querySelectorAll('.instead-feedback-display').forEach(el => el.remove());
    
    // Re-add feedback displays for all messages
    const messages = document.querySelectorAll('.mes');
    messages.forEach((messageElement) => {
        const mesidAttr = messageElement.getAttribute('mesid');
        if (mesidAttr !== null && mesidAttr !== '') {
            const messageId = parseInt(mesidAttr, 10);
            if (!isNaN(messageId) && messageId >= 0) {
                addFeedbackDisplayToMessage(messageId);
            }
        }
    });
}

/**
 * Show feedback popup dialog
 */
function showFeedbackPopup(messageId) {
    if (isProcessing) {
        toastr.warning('Please wait for the current revision to complete.');
        return;
    }

    const context = getContext();
    const chat = context.chat;
    const message = chat[messageId];

    // Create popup HTML
    const popupHtml = `
        <div class="instead-popup-overlay">
            <div class="instead-popup-container">
                <div class="instead-popup-header">
                    <h3>Feedback to the current message:</h3>
                    <button class="instead-popup-close">&times;</button>
                </div>
                <div class="instead-popup-body">
                    <div class="instead-original-message">
                        <strong>Original message:</strong>
                        <div class="instead-message-preview">${escapeHtml(message.mes)}</div>
                    </div>
                    <textarea 
                        class="instead-feedback-input text_pole" 
                        placeholder="Enter your editorial feedback here..."
                        rows="6"
                    ></textarea>
                </div>
                <div class="instead-popup-footer">
                    <button class="instead-cancel-btn menu_button">Cancel</button>
                    <button class="instead-send-btn menu_button menu_button_icon">
                        <i class="fa-solid fa-paper-plane"></i>
                        Send
                    </button>
                </div>
            </div>
        </div>
    `;

    // Add popup to page
    const popupElement = document.createElement('div');
    popupElement.innerHTML = popupHtml;
    document.body.appendChild(popupElement.firstElementChild);

    const popup = document.querySelector('.instead-popup-overlay');
    const feedbackInput = popup.querySelector('.instead-feedback-input');
    const sendBtn = popup.querySelector('.instead-send-btn');
    const cancelBtn = popup.querySelector('.instead-cancel-btn');
    const closeBtn = popup.querySelector('.instead-popup-close');

    // Focus on textarea
    setTimeout(() => feedbackInput.focus(), 100);

    // Close handlers
    const closePopup = () => {
        popup.remove();
    };

    closeBtn.addEventListener('click', closePopup);
    cancelBtn.addEventListener('click', closePopup);
    popup.addEventListener('click', (e) => {
        if (e.target === popup) closePopup();
    });

    // Send handler
    sendBtn.addEventListener('click', async () => {
        const feedback = feedbackInput.value.trim();
        if (!feedback) {
            toastr.warning('Please enter some feedback.');
            return;
        }

        closePopup();
        await processRevisionRequest(messageId, feedback);
    });

    // Allow Enter key with Ctrl/Cmd to send
    feedbackInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            // Prevent SillyTavern's global Ctrl+Enter handler from firing
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            sendBtn.click();
        }
    });
}

/**
 * Process the revision request with user feedback
 */
async function processRevisionRequest(messageId, feedback) {
    if (isProcessing) return;
    
    isProcessing = true;
    const context = getContext();
    const chat = context.chat;
    const message = chat[messageId];

    try {
        toastr.info('Generating revision with your feedback...');

        // Build a focused revision prompt
        const revisionPrompt = buildRevisionPrompt(feedback, message);
        
        // Check if streaming is enabled globally
        const isStreamingEnabled = isStreamingOn();
        
        if (isStreamingEnabled) {
            // Use streaming generation
            await processRevisionWithStreaming(messageId, feedback, message, revisionPrompt);
        } else {
            // Use non-streaming generation (original behavior)
            await processRevisionWithoutStreaming(messageId, feedback, message, revisionPrompt);
        }

    } catch (error) {
        console.error(`[${EXTENSION_NAME}] Error processing revision:`, error);
        toastr.error('An error occurred while processing the revision.');
    } finally {
        isProcessing = false;
    }
}

/**
 * Check if streaming is enabled in the current settings
 */
function isStreamingOn() {
    try {
        const context = getContext();
        // Check for OpenAI/Chat Completion streaming
        if (context.mainApi === 'openai') {
            return context.oai_settings?.stream_openai ?? false;
        }
        // Check for text completion streaming (KoboldAI, TextGen, etc.)
        if (context.mainApi === 'kobold') {
            return context.kai_settings?.streaming_kobold ?? false;
        }
        if (context.mainApi === 'textgenerationwebui') {
            return context.textgenerationwebui_settings?.streaming ?? false;
        }
        if (context.mainApi === 'novel') {
            return context.nai_settings?.streaming_novel ?? false;
        }
        // Default to false if we can't determine
        return false;
    } catch (error) {
        console.debug(`[${EXTENSION_NAME}] Could not determine streaming status:`, error);
        return false;
    }
}

/**
 * Process revision without streaming (original behavior)
 */
async function processRevisionWithoutStreaming(messageId, feedback, message, revisionPrompt) {
    // Send the revision request using ST's generation system
    const result = await generateRevision(revisionPrompt);

    // Extract the revised text and thinking from the result
    const revisedText = typeof result === 'object' ? (result.response || result).toString().trim() : (result || '').trim();
    const thinkingContent = typeof result === 'object' ? result.thinking : null;
    
    if (revisedText) {
        finalizeRevision(messageId, feedback, message, revisedText, thinkingContent);
    } else {
        toastr.error('Failed to generate revision.');
    }
}

/**
 * Process revision with streaming
 */
async function processRevisionWithStreaming(messageId, feedback, message, revisionPrompt) {
    // First, set up the swipe structure so we have a place to stream to
    setupSwipeForStreaming(message, feedback);
    
    const newSwipeId = message.swipes.length - 1;
    message.swipe_id = newSwipeId;
    message.mes = ''; // Start with empty message for streaming
    
    // Get the message element to update during streaming
    const messageElement = document.querySelector(`.mes[mesid="${messageId}"]`);
    const mesTextElement = messageElement?.querySelector('.mes_text');
    
    if (!mesTextElement) {
        console.error(`[${EXTENSION_NAME}] Could not find message element for streaming`);
        // Fall back to non-streaming
        await processRevisionWithoutStreaming(messageId, feedback, message, revisionPrompt);
        return;
    }
    
    // Show that we're streaming
    mesTextElement.innerHTML = '<span class="typing_indicator"><span>.</span><span>.</span><span>.</span></span>';
    
    let streamedText = '';
    let thinkingContent = null;
    
    try {
        // Use generateQuietPrompt with a streaming approach
        // Since generateQuietPrompt doesn't support streaming callbacks directly,
        // we'll use it normally but show progress indication
        // The actual streaming would require deeper integration with ST's streaming system
        
        const result = await generateRevision(revisionPrompt);
        
        // Extract the revised text and thinking from the result
        streamedText = typeof result === 'object' ? (result.response || result).toString().trim() : (result || '').trim();
        thinkingContent = typeof result === 'object' ? result.thinking : null;
        
        if (streamedText) {
            // Update the message with the final text
            message.mes = streamedText;
            message.swipes[newSwipeId] = streamedText;
            
            // Update the DOM with formatted text
            const context = getContext();
            const formattedText = messageFormatting(
                streamedText,
                context.name2,
                false, // isUser
                false, // isSystem
            );
            mesTextElement.innerHTML = formattedText;
            
            // Update swipe_info with thinking if available
            if (thinkingContent && message.swipe_info[newSwipeId]) {
                message.swipe_info[newSwipeId].extra = message.swipe_info[newSwipeId].extra || {};
                message.swipe_info[newSwipeId].extra.reasoning = thinkingContent;
            }
            
            // Update message extra
            if (!message.extra) {
                message.extra = {};
            }
            message.extra.instead_revised = true;
            message.extra.instead_feedback = feedback;
            if (thinkingContent) {
                message.extra.reasoning = thinkingContent;
            }
            
            // Mark generation as finished
            if (message.swipe_info[newSwipeId]) {
                message.swipe_info[newSwipeId].gen_finished = new Date().toISOString();
            }

            // Save the chat
            await saveChatConditional();
            
            // Reload to ensure proper rendering of all elements (thinking box, etc.)
            await reloadCurrentChat();

            toastr.success('Revision added as new swipe! Swipe left to see the original.');
        } else {
            // Remove the empty swipe we added
            message.swipes.pop();
            message.swipe_info.pop();
            message.swipe_id = message.swipes.length - 1;
            message.mes = message.swipes[message.swipe_id];
            await reloadCurrentChat();
            toastr.error('Failed to generate revision.');
        }
    } catch (error) {
        console.error(`[${EXTENSION_NAME}] Streaming error:`, error);
        // Clean up on error
        if (message.swipes.length > 1) {
            message.swipes.pop();
            message.swipe_info.pop();
            message.swipe_id = message.swipes.length - 1;
            message.mes = message.swipes[message.swipe_id];
        }
        await reloadCurrentChat();
        throw error;
    }
}

/**
 * Set up the swipe structure for streaming
 */
function setupSwipeForStreaming(message, feedback) {
    // Initialize swipes array if it doesn't exist
    if (!Array.isArray(message.swipes)) {
        message.swipes = [message.mes];
        message.swipe_info = [message.extra ? { extra: { ...message.extra } } : {}];
        message.swipe_id = 0;
    }
    
    // Ensure swipe_info array exists and matches swipes length
    if (!Array.isArray(message.swipe_info)) {
        message.swipe_info = message.swipes.map(() => ({}));
    }
    
    // Pad swipe_info to match swipes array if needed
    while (message.swipe_info.length < message.swipes.length) {
        message.swipe_info.push({});
    }
    
    // Add placeholder for the new swipe
    message.swipes.push('');
    message.swipe_info.push({
        send_date: new Date().toISOString(),
        gen_started: new Date().toISOString(),
        gen_finished: null, // Will be set when generation completes
        extra: {
            api: 'inSTead',
            model: 'revision',
            instead_revised: true,
            instead_feedback: feedback,
        },
    });
}

/**
 * Finalize revision (used by non-streaming path)
 */
function finalizeRevision(messageId, feedback, message, revisedText, thinkingContent) {
    // Initialize swipes array if it doesn't exist
    if (!Array.isArray(message.swipes)) {
        // First swipe should be the current message content
        message.swipes = [message.mes];
        message.swipe_info = [message.extra ? { extra: { ...message.extra } } : {}];
        message.swipe_id = 0;
    }
    
    // Ensure swipe_info array exists and matches swipes length
    if (!Array.isArray(message.swipe_info)) {
        message.swipe_info = message.swipes.map(() => ({}));
    }
    
    // Pad swipe_info to match swipes array if needed
    while (message.swipe_info.length < message.swipes.length) {
        message.swipe_info.push({});
    }
    
    // Build the extra data for the new swipe
    const newSwipeExtra = {
        api: 'inSTead',
        model: 'revision',
        instead_revised: true,
        instead_feedback: feedback,
    };
    
    // Include thinking content if available
    if (thinkingContent) {
        newSwipeExtra.reasoning = thinkingContent;
    }
    
    // Add the revision as a new swipe
    message.swipes.push(revisedText);
    message.swipe_info.push({
        send_date: new Date().toISOString(),
        gen_started: new Date().toISOString(),
        gen_finished: new Date().toISOString(),
        extra: newSwipeExtra,
    });
    
    // Switch to the new swipe
    const newSwipeId = message.swipes.length - 1;
    message.swipe_id = newSwipeId;
    message.mes = revisedText;
    
    // Update extra to mark as revised and include thinking
    if (!message.extra) {
        message.extra = {};
    }
    message.extra.instead_revised = true;
    message.extra.instead_feedback = feedback;
    
    // Include thinking content in message extra for display
    if (thinkingContent) {
        message.extra.reasoning = thinkingContent;
    }

    // Save and re-render
    saveChatConditional().then(() => reloadCurrentChat());

    toastr.success('Revision added as new swipe! Swipe left to see the original.');
}
/**
 * Build the revision prompt - a focused instruction for the AI
 * The generateQuietPrompt function already includes chat context,
 * so we just need to provide the revision-specific instruction
 */
function buildRevisionPrompt(feedback, originalMessage) {
    // Create a focused revision instruction with clear boundaries and constraints
    const revisionPrompt = `# Editorial Revision Task

You are performing an editorial revision. Your ONLY task is to rewrite the message below according to the feedback provided.

## Critical Rules
- Output ONLY the revised message text
- Do NOT continue the story or add new events
- Do NOT add meta-commentary, explanations, or notes
- Do NOT acknowledge or reference these instructions
- Maintain the same general length unless the feedback specifically requests otherwise

## Original Message to Revise
<original_message>
${originalMessage.mes}
</original_message>

## Editorial Feedback
<feedback>
${feedback}
</feedback>

## Your Task
Rewrite the original message above, incorporating the editorial feedback. The revision should:
1. Address the specific feedback points
2. Maintain consistency with prior conversation context
3. End at the same narrative point as the original (do not continue beyond it)
4. Preserve the original message's role in the conversation

Begin your revised message now:`;

    return revisionPrompt;
}

/**
 * Generate revision using SillyTavern's generation API
 */
async function generateRevision(revisionPrompt) {
    // Use SillyTavern's generateQuietPrompt which properly integrates with all backends
    // Function signature: generateQuietPrompt(quietPrompt, quietToLoud, skipWIAN, quietImage, quietName)
    const result = await generateQuietPrompt(revisionPrompt, false);
    
    return result || '';
}

/**
 * Escape HTML for safe display
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Load extension settings
 */
function loadSettings() {
    if (!extension_settings.instead) {
        extension_settings.instead = {};
    }
}

/**
 * Handle click on feedback icon using event delegation
 */
function onFeedbackIconClick(event) {
    const target = event.target.closest('.instead-feedback-icon');
    if (!target) return;
    
    event.stopPropagation();
    event.preventDefault();
    
    const messageId = parseInt(target.getAttribute('data-mesid'));
    if (!isNaN(messageId)) {
        showFeedbackPopup(messageId);
    }
}

// Initialize extension when jQuery is ready
jQuery(async () => {
    console.log(`[${EXTENSION_NAME}] Initializing...`);
    
    try {
        loadSettings();
        
        // Use event delegation for click handling (works even if button added later)
        $(document).on('click', '.instead-feedback-icon', onFeedbackIconClick);
        
        // Add icons and feedback displays to existing messages
        addFeedbackIconsToMessages();
        
        // Listen for new character messages being rendered
        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => {
            console.debug(`[${EXTENSION_NAME}] CHARACTER_MESSAGE_RENDERED event for message ${messageId}`);
            addFeedbackIconToMessage(messageId);
            addFeedbackDisplayToMessage(messageId);
        });
        
        // Also listen for chat changes to re-add icons and feedback displays
        eventSource.on(event_types.CHAT_CHANGED, () => {
            console.debug(`[${EXTENSION_NAME}] CHAT_CHANGED event`);
            // Small delay to ensure DOM is updated
            setTimeout(addFeedbackIconsToMessages, 100);
        });
        
        // Listen for app ready event (fires on initial load and profile switches)
        eventSource.on(event_types.APP_READY, () => {
            console.debug(`[${EXTENSION_NAME}] APP_READY event`);
            setTimeout(addFeedbackIconsToMessages, 100);
        });
        
        // Listen for settings loaded (fires when switching profiles/accounts)
        eventSource.on(event_types.SETTINGS_LOADED, () => {
            console.debug(`[${EXTENSION_NAME}] SETTINGS_LOADED event`);
            loadSettings();
            setTimeout(addFeedbackIconsToMessages, 200);
        });
        
        // Listen for swipe changes to update feedback displays
        eventSource.on(event_types.MESSAGE_SWIPED, () => {
            console.debug(`[${EXTENSION_NAME}] MESSAGE_SWIPED event`);
            // Small delay to ensure swipe has been applied
            setTimeout(updateFeedbackDisplays, 50);
        });
        
        // Use MutationObserver as a fallback to detect when messages are added to the DOM
        // This handles cases where events might not fire properly during profile switches
        const chatContainer = document.getElementById('chat');
        if (chatContainer) {
            const observer = new MutationObserver((mutations) => {
                let hasNewMessages = false;
                for (const mutation of mutations) {
                    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                        for (const node of mutation.addedNodes) {
                            if (node.nodeType === Node.ELEMENT_NODE && 
                                (node.classList?.contains('mes') || node.querySelector?.('.mes'))) {
                                hasNewMessages = true;
                                break;
                            }
                        }
                    }
                    if (hasNewMessages) break;
                }
                if (hasNewMessages) {
                    // Debounce to avoid excessive calls
                    clearTimeout(observer.debounceTimer);
                    observer.debounceTimer = setTimeout(() => {
                        console.debug(`[${EXTENSION_NAME}] MutationObserver detected new messages`);
                        addFeedbackIconsToMessages();
                    }, 150);
                }
            });
            
            observer.observe(chatContainer, { childList: true, subtree: true });
            console.debug(`[${EXTENSION_NAME}] MutationObserver attached to chat container`);
        }
        
        console.log(`[${EXTENSION_NAME}] Initialized successfully`);
    } catch (error) {
        console.error(`[${EXTENSION_NAME}] Failed to initialize:`, error);
    }
});
