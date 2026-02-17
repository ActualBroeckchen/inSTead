/**
 * inSTead - SillyTavern Extension
 * Adds editorial feedback capability to character messages
 */

// Third-party extensions are at /scripts/extensions/third-party/[name]/
// So we need to go up 4 levels to reach /scripts/ for script.js
// And 3 levels up to reach /scripts/ then extensions.js for extensions.js
import { getContext, extension_settings } from '../../../extensions.js';
import { eventSource, event_types, saveChatConditional, reloadCurrentChat, saveSettingsDebounced, generateQuietPrompt } from '../../../../script.js';

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
        // generateQuietPrompt already includes chat context, so we just need the instruction
        const revisionPrompt = buildRevisionPrompt(feedback, message);

        // Send the revision request using ST's generation system
        const result = await generateRevision(revisionPrompt);

        // Extract the revised text and thinking from the result
        const revisedText = typeof result === 'object' ? (result.response || result).toString().trim() : (result || '').trim();
        const thinkingContent = typeof result === 'object' ? result.thinking : null;
        
        if (revisedText) {
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
            await saveChatConditional();
            await reloadCurrentChat();

            toastr.success('Revision added as new swipe! Swipe left to see the original.');
        } else {
            toastr.error('Failed to generate revision.');
        }

    } catch (error) {
        console.error(`[${EXTENSION_NAME}] Error processing revision:`, error);
        toastr.error('An error occurred while processing the revision.');
    } finally {
        isProcessing = false;
    }
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
- The revised message must END at approximately the same narrative point as the original
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
    const result = await generateQuietPrompt({
        quietPrompt: revisionPrompt,
        quietToLoud: false,  // Don't add to chat
    });
    
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
        
        // Add icons to existing messages
        addFeedbackIconsToMessages();
        
        // Listen for new character messages being rendered
        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => {
            console.debug(`[${EXTENSION_NAME}] CHARACTER_MESSAGE_RENDERED event for message ${messageId}`);
            addFeedbackIconToMessage(messageId);
        });
        
        // Also listen for chat changes to re-add icons
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
