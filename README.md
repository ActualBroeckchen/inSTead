# inSTead

A SillyTavern extension that adds editorial feedback capability to character messages. Get better responses by providing specific feedback and requesting revisions.

## Features

- **Feedback Icon**: Adds a small pen icon to the message toolbar on all character messages
- **Interactive Popup**: Click the icon to open a feedback dialog with the original message preview
- **Smart Revision**: The extension sends a custom prompt to the LLM that includes:
  - All normal context (character definition, persona, message history)
  - The original message marked as "your first suggestion"
  - Your editorial feedback
  - A request to revise according to your input

## Installation

1. Open SillyTavern
2. Go to Extensions (puzzle piece icon)
3. Click "Install Extension"
4. Choose "Install from URL" or "Install from folder"
5. Enter this repository URL or select the folder containing the extension files
6. The extension will be automatically enabled

Alternatively, manually copy the extension files to your SillyTavern installation:
```
SillyTavern/public/scripts/extensions/instead/
```

## Usage

1. **Find the Icon**: Look for the pen-to-square icon (📝) in the message toolbar of any character message (same row as the edit button and message menu)

2. **Provide Feedback**: Click the icon to open the feedback dialog
   - Review the original message shown in the preview
   - Enter your editorial feedback in the text area
   - Example feedback: "Make this more dramatic", "Add more detail about the setting", "Make the character sound more cheerful"

3. **Send and Wait**: Click "Send" (or press Ctrl/Cmd + Enter)
   - The extension will generate a revised message based on your feedback
   - The original message will be replaced with the revision
   - A notification will confirm when the revision is complete

## How It Works

When you submit feedback, inSTead:

1. Gathers the normal prompt context (character card, persona, chat history)
2. **Excludes** the message you're revising from the chat history
3. Adds a special section to the prompt:
   ```
   Your first suggestion for continuing this story was the following:
   <<<BEGIN ORIGINAL SUGGESTION>>>
   [original message]
   <<<END ORIGINAL SUGGESTION>>>
   
   The user has reviewed your suggestion and given the following feedback: 
   "[your feedback]". Revise according to this editorial input.
   ```
4. Sends this modified prompt to your configured LLM
5. Replaces the original message with the LLM's revision

## Tips

- **Be specific**: Instead of "make it better", try "add more sensory details" or "make the dialogue more natural"
- **Use for any issue**: Grammar, tone, pacing, detail level, character consistency, etc.
- **Iterate**: You can request revisions multiple times on the same message
- **Works with all backends**: Compatible with any LLM backend you have configured in SillyTavern

## Technical Details

- **Manifest Version**: 1
- **Files**: 
  - `manifest.json` - Extension metadata
  - `index.js` - Main functionality
  - `style.css` - UI styling
- **Dependencies**: None (uses SillyTavern's built-in APIs)
- **Compatibility**: SillyTavern 1.10.0+

## Troubleshooting

**Icon not appearing**: 
- Make sure the extension is enabled in the Extensions menu
- Refresh the page (F5)
- Check browser console for errors

**Revision fails**:
- Ensure your LLM backend is properly configured
- Check that you have an active connection to your AI service
- Verify your API settings in SillyTavern

**Popup doesn't open**:
- Check for JavaScript errors in browser console
- Try disabling other extensions temporarily to check for conflicts

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT License - Feel free to modify and distribute as needed.

## Credits

Created by ActualBroeckchen

---

*Enhance your storytelling with targeted, iterative improvements!*
