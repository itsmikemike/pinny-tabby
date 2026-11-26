# Pinny Tabby

A Chrome extension that opens your chosen set of pinned tabs every time Chrome starts.

## Install

The easiest way is the [Chrome Web Store](https://chromewebstore.google.com/detail/pinny-tabby/nmgifohnngmmelbmcdfpgojgkifcnbhc). Updates arrive automatically.

To load it from source instead (for developers):

1. Download the repo (**Code → Download ZIP**) and unzip it somewhere permanent. Chrome loads the extension from this folder, so don't delete it.
2. In Chrome, go to `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick the `extension` folder.
5. The settings page opens. Add your sites and click **Save**.

If you already installed it from the Web Store, remove one copy first so the two don't conflict.

## Using it

- **Use my current pinned tabs**: pin the tabs you want, then click this to copy them into the list.
- **Open now**: test it without restarting Chrome.
- **Replace pinned tabs on startup**: turn this on if Chrome's "Continue where you left off" setting keeps leaving duplicates or old pinned tabs around.
- Click the extension's toolbar icon (in the puzzle-piece menu) any time to get back to settings.

Your list syncs to any Chrome where you're signed in and have the extension installed.

## Profiles

Make a profile for each part of your day (Work, Home, Projects…), each with its own pinned sites and color. Up to 5.

- **Click** the toolbar icon to pick a profile. Switching closes the old profile's pinned tabs and opens the new ones.
- **Right-click** the icon for a quick profile menu.
- **Alt+Shift+P** jumps to the next profile. Turn it off in settings under **Keyboard shortcut**, or change or clear the key at `chrome://extensions/shortcuts`.
- The toolbar icon is a pushpin on the active profile's color, with a small white tag showing the profile's first letter.
- When Chrome starts, the active profile opens.
- Switching closes the old profile's pinned tabs. Right after a switch you can **Undo** from the popup or the settings page (for 5 minutes).
- Removing a site or deleting a profile can also be undone from the message that appears.

Tip: pin the extension (puzzle-piece menu → pin) so the icon is always visible.

## Icons

`icons/` holds the app icon (a white pushpin on a seafoam squircle, with a white "P" tag at the lower right) at 16, 32, 48 and 128 px. The pushpin is from Lucide (ISC license). The 128 px one is what the Chrome Web Store shows.

## Base URLs

In the **Settings** card, turn on **Strip addresses to the base URL** to save sites as just their main address. For example, `https://mail.google.com/mail/u/0/#inbox` becomes `https://mail.google.com`. It applies to sites you add, edit or import from then on. **Strip existing sites** shortens every saved address in all profiles at once (with Undo).

## Fonts

All fonts are bundled in `fonts/`, so the extension never loads anything from the web: Fraunces for headlines and Inter for everything else (both SIL Open Font License, included).

## Colors

The look is the Seafoam palette. Its tokens and components are documented in the Pinny Tabby design system; `options.css` uses the same token names.

Each profile gets one of six colors:

| Name | Hex |
| --- | --- |
| Seafoam | `#14B8A0` |
| Coral | `#FF8A65` |
| Sun | `#FFC93C` |
| Lilac | `#A08CFF` |
| Sky | `#4FB8F5` |
| Ink | `#14302E` |

Profiles saved with the earlier, deeper colors are switched to these automatically. The store images use a pale sea-glass background to match.

## Licenses

Third-party notices (Lucide icons, Fraunces and Inter fonts) are in `LICENSES.txt`.

## Privacy

The privacy policy is `privacy.html`, linked from the bottom of the settings page. A copy with the fonts built in, for hosting at a public address, is kept alongside the store kit.
