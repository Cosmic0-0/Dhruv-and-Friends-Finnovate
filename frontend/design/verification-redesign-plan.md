# FraudLens verification redesign

## Palette and type

- Ink `#10191B`: the dark app and landing foundation.
- Evidence `#1D2B2D`: panels that hold material being inspected.
- Paper `#F3EFE4`: received messages, documents, and high priority text surfaces.
- Amber `#E9A64B`: the wax seal, active navigation, and actions.
- Vermilion `#F07868`: fraud findings and marked evidence.
- Mist `#B9C8C5`: secondary text on Ink (AA contrast).

Instrument Sans stays the interface voice, with compact, generous headings. Received messages use the system font so the scammer's words remain visually separate from FraudLens's explanation. Monospace is reserved for domains, file types, and provenance lines.

## Page layouts

```text
Desktop app shell                 Phone app shell
┌─────────────┬───────────────┐   ┌──────────────────────┐
│ seal + name │ page heading  │   │ seal + page heading  │
│ Check       │               │   │                      │
│ Document    │ page content  │   │ page content         │
│ Learn       │               │   │                      │
│ other links │               │   ├──────────────────────┤
└─────────────┴───────────────┘   │ Check Document Learn │
                                  └──────────────────────┘

Check                              Document
┌────────────────┬─────────────┐   ┌────────────────┬─────────────┐
│ question +     │ how a check │   │ document       │ what is      │
│ paste input    │ is verified │   │ intake desk    │ inspected    │
│ quick actions  │ recent work │   │ selected file  │ privacy     │
└────────────────┴─────────────┘   └────────────────┴─────────────┘

Learn                              Landing
┌────────────────┬─────────────┐   ┌──────────────────────────────┐
│ specimen SMS   │ pattern     │   │ promise       evidence card  │
│ verdict choice │ reference   │   ├────────── seal ──────────────┤
│ explanation    │ progress    │   │ real local scams + methods   │
└────────────────┴─────────────┘   └──────────────────────────────┘
```

## Principles and default-trait review

The evidence card is the one theatrical moment: message, marked phrases, verdict, and provenance align like a case file. Elsewhere, use quiet rules and flat surfaces so it holds attention. The wax seal is a small recurring mark, never a repeated decorative stamp.

The sidebar gets direct destination names and a divider, without a small-caps “Tools” eyebrow. Message specimens, learning references, progress, and document intake have different structures; they do not share one rounded shadow card. The document screen is an intake desk with a visible file record, inspection scope, and privacy note, not a dashed drop zone. Buttons name their actions; no ornamental arrows or decorative sequence numbers. The quiz retains its real question count. On phones, a fixed labelled bottom nav contains Check, Document, Learn, and a More menu for the remaining destinations. Focus has a visible amber outline, secondary text meets contrast on Ink, and all motion can stop.

## Screenshot review

Captured Landing, Check, Document, and Learn at 390 × 1100 and 1440 × 900 in `screenshots/`, plus a 320 × 850 Check viewport for narrow-phone overflow. A tall desktop landing capture also confirmed that the paper sections, local scam examples, and product channels carry the evidence palette below the hero. The desktop landing evidence card holds the composition; on phones, the SMS and verdict begin within the first scroll. Check retains a clear first action, Document shows the seal and inspection scope, and Learn separates a paper message specimen from progress and reference material. The initial screenshots exposed a dark landing headline, a pale install prompt, and two active desktop navigation links on Document; all were corrected before the final captures. The progress pair was also changed from matching dark cards to distinct ledger surfaces. Secondary Mist on Ink measures 10.31:1 contrast; amber on Ink measures 8.51:1. At 320 px the Check actions stack without horizontal overflow.
