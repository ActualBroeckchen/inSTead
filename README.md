# inSTead

A SillyTavern extension that adds editorial feedback capability to character messages. Get better responses by providing specific feedback and requesting revisions—without losing the original!

## Features

- **Feedback Icon**: Adds a rotating arrows icon (🔄) to the extra message buttons menu (click the ⋯ button on any AI message)
- **Interactive Popup**: Click the icon to open a mobile-friendly feedback dialog with the original message preview
- **Non-Destructive Revisions**: Revisions are added as **swipes**, preserving the original message—swipe left to see it anytime
- **Smart Revision**: The extension uses SillyTavern's generation system with your existing settings and context

## Installation

1. Open SillyTavern
2. Go to Extensions (puzzle piece icon)
3. Click "Install Extension"
4. Choose "Install from URL" or "Install from folder"
5. Enter this repository URL or select the folder containing the extension files
6. The extension will be automatically enabled

Alternatively, manually copy the extension files to your SillyTavern installation:
```
SillyTavern/data/<user-handle>/extensions/third-party/inSTead/
```

## Usage

1. **Find the Icon**: Click the ⋯ (ellipsis) button on any AI message to open the extra buttons menu, then look for the rotating arrows icon (🔄)

2. **Provide Feedback**: Click the icon to open the feedback dialog
   - Review the original message shown in the preview
   - Enter your editorial feedback in the text area
   - Example feedback: "Make this more dramatic", "Add more detail about the setting", "Make the character sound more cheerful"

3. **Send and Wait**: Click "Send" (or press Ctrl/Cmd + Enter)
   - The extension will generate a revised message based on your feedback
   - The revision is added as a **new swipe**—the original is preserved!
   - Swipe left to compare with the original, swipe right to return to the revision

## How It Works

When you submit feedback, inSTead:

1. Uses SillyTavern's `generateQuietPrompt` API (works with all backends)
2. Sends a revision instruction that includes:
   - The original message text
   - Your editorial feedback
   - A request to write a revised version
3. Adds the generated revision as a new swipe on the message
4. Automatically switches to display the revision

The extension leverages your existing SillyTavern configuration—character card, chat context, and generation settings are all used automatically.

## Tips

- **Be specific**: Instead of "make it better", try "add more sensory details" or "make the dialogue more natural"
- **Use for any issue**: Grammar, tone, pacing, detail level, character consistency, etc.
- **Iterate**: You can request multiple revisions—each becomes a new swipe you can compare
- **Works with all backends**: Compatible with any LLM backend configured in SillyTavern (OpenAI, Claude, local models, etc.)
- **Mobile-friendly**: The popup is fully responsive and works well on phones and tablets

## Technical Details

- **Manifest Version**: 1
- **Files**: 
  - `manifest.json` - Extension metadata
  - `index.js` - Main functionality (ES module)
  - `style.css` - Responsive UI styling
- **Dependencies**: None (uses SillyTavern's built-in APIs)
- **API Used**: `generateQuietPrompt` for generation, standard swipe system for results
- **Compatibility**: SillyTavern 1.10.0+

## Troubleshooting

**Icon not appearing**: 
- Make sure the extension is enabled in the Extensions menu
- The icon appears in the extra buttons menu (click ⋯ on a message first)
- Refresh the page (F5)
- Check browser console for errors

**Revision fails**:
- Ensure your LLM backend is properly configured and connected
- Check that you have an active connection to your AI service
- Look for error messages in the browser console (F12)

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
