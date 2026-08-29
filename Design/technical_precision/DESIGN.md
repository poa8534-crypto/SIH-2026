---
name: Technical Precision
colors:
  surface: '#f9f9ff'
  surface-dim: '#d9d9e2'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3fc'
  surface-container: '#ededf6'
  surface-container-high: '#e7e8f0'
  surface-container-highest: '#e1e2ea'
  on-surface: '#191c21'
  on-surface-variant: '#424752'
  inverse-surface: '#2e3037'
  inverse-on-surface: '#f0f0f9'
  outline: '#727784'
  outline-variant: '#c2c6d4'
  surface-tint: '#115cb9'
  primary: '#003f87'
  on-primary: '#ffffff'
  primary-container: '#0056b3'
  on-primary-container: '#bbd0ff'
  inverse-primary: '#acc7ff'
  secondary: '#385e9a'
  on-secondary: '#ffffff'
  secondary-container: '#98bcfe'
  on-secondary-container: '#224b85'
  tertiary: '#722b00'
  on-tertiary: '#ffffff'
  tertiary-container: '#983c00'
  on-tertiary-container: '#ffc2a7'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d7e2ff'
  primary-fixed-dim: '#acc7ff'
  on-primary-fixed: '#001a40'
  on-primary-fixed-variant: '#004491'
  secondary-fixed: '#d6e3ff'
  secondary-fixed-dim: '#aac7ff'
  on-secondary-fixed: '#001b3e'
  on-secondary-fixed-variant: '#1c4681'
  tertiary-fixed: '#ffdbcc'
  tertiary-fixed-dim: '#ffb694'
  on-tertiary-fixed: '#351000'
  on-tertiary-fixed-variant: '#7b2f00'
  background: '#f9f9ff'
  on-background: '#191c21'
  surface-variant: '#e1e2ea'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  container-padding: 24px
  gutter: 16px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style
The design system is engineered for accuracy, reliability, and clarity within the construction technology sector. It facilitates the management of complex data through a **Modern Corporate** aesthetic that prioritizes high legibility and a calm, methodical user experience. 

The visual language is strictly functional. It avoids decorative trends like gradients or glassmorphism in favor of a flat, structured interface. The emotional response is one of stability and professional confidence, ensuring that site supervisors and project managers can focus on progress tracking without visual distraction.

## Colors
The palette is rooted in a spectrum of industrial blues and technical grays. 

- **Primary Blue (#0056B3):** Used for primary actions, active states, and critical progress indicators.
- **Heading Blue (#0B3B75):** A deep, authoritative navy reserved for page titles and section headers to establish a clear hierarchy.
- **Neutrals:** The background uses a cool-toned off-white (#F7F8FC) to reduce eye strain, while cards and interactive surfaces use pure white (#FFFFFF) to pop against the base.
- **Selection:** Use the Pale Blue highlight (#E8F0FF) for table row hovering, selected states in lists, and subtle background fills for active navigation items.
- **Functional Constraints:** Do not use green for "complete" states to avoid confusion with architectural safety standards; rely on the Primary Blue or high-contrast grays for completion status.

## Typography
This design system utilizes **Inter** across all levels to maintain a systematic, utilitarian feel. 

- **Headlines:** Use `Heading Blue` for all headlines. Use the `-0.01em` to `-0.02em` letter spacing on larger sizes to maintain a tight, professional appearance.
- **Body Text:** Use `Text Primary` for standard reading. For metadata, timestamps, and secondary descriptions, switch to `Text Secondary`.
- **Labels:** Labels for status chips and table headers should be uppercase with the defined letter spacing to distinguish them from interactive body text.

## Layout & Spacing
The layout follows a **Fixed Grid** philosophy on desktop (1280px max-width) and a **Fluid Grid** on mobile devices. 

- **Grid:** A 12-column grid is used for desktop dashboards. Gutters are fixed at 16px to maintain a high information density suitable for technical data.
- **Margins:** Page margins are set to 24px on desktop and 16px on mobile.
- **Rhythm:** All spatial relationships are multiples of 4px. Use `stack-md` (16px) for the vertical gap between cards in a feed and `stack-sm` (8px) for internal card padding between elements.

## Elevation & Depth
Depth is communicated through **Low-contrast outlines** and subtle tonal shifts rather than shadows. 

- **Surfaces:** All cards and containers must have a 1px solid border using `#D9E1EC`. 
- **Shadows:** Avoid drop shadows entirely. If a "raised" effect is required for a modal or dropdown, use a 1px border with a very soft, neutral-gray ambient glow (e.g., 0px 4px 12px rgba(0, 0, 0, 0.05)) to ensure the UI remains flat and technical.
- **Layering:** Content sits on the Background (#F7F8FC). Primary containers sit on top using Surface (#FFFFFF).

## Shapes
The shape language is controlled and precise. A consistent **8px to 10px corner radius** (Level 2) is applied to all primary UI elements including cards, input fields, and buttons.

- **Buttons & Inputs:** Use a 8px radius.
- **Large Containers/Cards:** Use a 10px radius.
- **Exceptions:** Status tags or "chips" may use a fully rounded (pill) shape to distinguish them from actionable buttons.

## Components
- **Buttons:** Primary buttons use a solid Primary Blue fill with white text. Secondary buttons use a white fill with a Primary Blue border and text. Use no gradients.
- **Input Fields:** 1px solid border (#D9E1EC) that transitions to Primary Blue on focus. Use Text Secondary for placeholder text.
- **Cards:** White background, 10px radius, 1px solid border. Headers within cards should have a subtle bottom border to separate titles from content.
- **Chips/Status:** Use the Highlight color (#E8F0FF) as a background for "In Progress" or "Scheduled" states, with Primary Blue text.
- **Icons:** Use a consistent stroke weight (2px). Icons are always monochromatic, utilizing Primary Blue for interactive elements and Text Secondary for decorative or informational elements.
- **Progress Bars:** Use a thick 8px track. The track background should be the Border color (#D9E1EC), and the fill should be Primary Blue.
- **Data Tables:** High density. Use Heading Blue for column headers. Every second row should use a #F7F8FC zebra stripe or the Highlight color on hover.