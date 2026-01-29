/**
 * inSTead - SillyTavern Extension
 * Adds editorial feedback capability to character messages
 */

(function() {
    'use strict';

    const EXTENSION_NAME = 'inSTead';
    const FEEDBACK_ICON = '📝'; // You can change this to any icon/emoji you prefer
    
    let isProcessing = false;

    /**
     * Initialize the extension
     */
    function init() {
        console.log(`[${EXTENSION_NAME}] Initializing...`);
        
        // Wait for SillyTavern to be ready
        if (typeof eventSource === 'undefined' || typeof chat_metadata === 'undefined') {
            console.log(`[${EXTENSION_NAME}] Waiting for SillyTavern...`);
            setTimeout(init, 1000);
            return;
        }

        // Add feedback icons to existing messages
        addFeedbackIconsToMessages();

        // Listen for new messages
        eventSource.on('messageRendered', (messageId) => {
            addFeedbackIconToMessage(messageId);
        });

        console.log(`[${EXTENSION_NAME}] Initialized successfully`);
    }

    /**
     * Add feedback icons to all character messages
     */
    function addFeedbackIconsToMessages() {
        const messages = document.querySelectorAll('.mes');
        messages.forEach((messageElement) => {
            const messageId = messageElement.getAttribute('mesid');
            if (messageId !== null) {
                addFeedbackIconToMessage(parseInt(messageId));
            }
        });
    }

    /**
     * Add feedback icon to a specific message
     */
    function addFeedbackIconToMessage(messageId) {
        const chat = getContext().chat;
        if (!chat || messageId >= chat.length) return;

        const message = chat[messageId];
        
        // Only add to character messages (not user messages)
        if (message.is_user) return;

        const messageElement = document.querySelector(`.mes[mesid="${messageId}"]`);
        if (!messageElement) return;

        // Check if icon already exists
        if (messageElement.querySelector('.instead-feedback-icon')) return;

        // Find the message buttons container
        const buttonsContainer = messageElement.querySelector('.mes_buttons');
        if (!buttonsContainer) return;

        // Create feedback icon button
        const feedbackButton = document.createElement('div');
        feedbackButton.className = 'mes_button instead-feedback-icon';
        feedbackButton.innerHTML = `<i class="fa-solid fa-pen-to-square"></i>`;
        feedbackButton.title = 'Request revision with feedback';
        feedbackButton.setAttribute('data-mesid', messageId);

        // Add click handler
        feedbackButton.addEventListener('click', (e) => {
            e.stopPropagation();
            showFeedbackPopup(messageId);
        });

        // Insert the button (before the last button which is usually the menu)
        buttonsContainer.insertBefore(feedbackButton, buttonsContainer.firstChild);
    }

    /**
     * Show feedback popup dialog
     */
    function showFeedbackPopup(messageId) {
        if (isProcessing) {
            toastr.warning('Please wait for the current revision to complete.');
            return;
        }

        const chat = getContext().chat;
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
        const originalMessage = chat[messageId];

        try {
            toastr.info('Generating revision with your feedback...');

            // Build the custom prompt
            const revisedPrompt = await buildRevisionPrompt(messageId, feedback, originalMessage);

            // Temporarily remove the last character message from chat
            const messagesToKeep = chat.slice(0, messageId);
            const removedMessages = chat.slice(messageId);
            
            // Store original chat
            const originalChat = [...chat];
            
            // Truncate chat to exclude the message we're revising
            context.chat = messagesToKeep;

            // Send the revision request
            const result = await generateRevision(revisedPrompt);

            // Restore the full chat
            context.chat = originalChat;

            if (result && result.trim()) {
                // Replace the original message with the revision
                chat[messageId].mes = result;
                chat[messageId].gen_started = new Date();
                chat[messageId].gen_finished = new Date();
                
                // Mark as edited
                if (!chat[messageId].extra) {
                    chat[messageId].extra = {};
                }
                chat[messageId].extra.instead_revised = true;
                chat[messageId].extra.instead_feedback = feedback;

                // Save and re-render
                await saveChatConditional();
                await reloadCurrentChat();

                toastr.success('Message revised successfully!');
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
     * Build the revision prompt
     */
    async function buildRevisionPrompt(messageId, feedback, originalMessage) {
        const context = getContext();
        
        // Get the normal prompt up to (but not including) the message being revised
        const promptParts = [];
        
        // Add system prompt / character definition
        if (context.systemPrompt) {
            promptParts.push(context.systemPrompt);
        }
        
        // Add character card
        if (context.characterId) {
            const character = context.characters[context.characterId];
            if (character && character.description) {
                promptParts.push(character.description);
            }
        }

        // Add persona
        if (context.persona) {
            promptParts.push(`[Your character: ${context.name1}]\n${context.persona}`);
        }

        // Add message history (excluding the message being revised)
        const chat = context.chat;
        for (let i = 0; i < messageId; i++) {
            const msg = chat[i];
            const name = msg.is_user ? context.name1 : context.name2;
            promptParts.push(`${name}: ${msg.mes}`);
        }

        // Add the revision-specific instructions
        promptParts.push('\n---\n');
        promptParts.push('Your first suggestion for continuing this story was the following:\n');
        promptParts.push('<<<BEGIN ORIGINAL SUGGESTION>>>');
        promptParts.push(originalMessage.mes);
        promptParts.push('<<<END ORIGINAL SUGGESTION>>>');
        promptParts.push('\n');
        promptParts.push(`The user has reviewed your suggestion and given the following feedback: "${feedback}". Revise according to this editorial input.`);

        return promptParts.join('\n');
    }

    /**
     * Generate revision using the AI
     */
    async function generateRevision(prompt) {
        const context = getContext();
        
        // Use SillyTavern's generation API
        const response = await fetch('/api/backends/chat-completion/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt: prompt,
                use_mancer: false,
                use_openrouter: false,
                // Add other necessary generation parameters from context
                max_length: context.amount_gen || 300,
                temperature: context.temp || 0.7,
                // ... other settings as needed
            }),
        });

        if (!response.ok) {
            throw new Error(`Generation failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data.response || data.text || '';
    }

    /**
     * Escape HTML for safe display
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Initialize when jQuery is ready
    if (typeof jQuery !== 'undefined') {
        jQuery(async () => {
            await loadSettings();
            init();
        });
    } else {
        console.error(`[${EXTENSION_NAME}] jQuery not found`);
    }

    /**
     * Load extension settings (placeholder for future settings)
     */
    async function loadSettings() {
        // Placeholder for loading settings from extension_settings
        if (typeof extension_settings !== 'undefined') {
            if (!extension_settings.instead) {
                extension_settings.instead = {};
            }
        }
    }

    /**
     * Save extension settings (placeholder for future settings)
     */
    async function saveSettings() {
        if (typeof saveSettingsDebounced !== 'undefined') {
            saveSettingsDebounced();
        }
    }

})();
