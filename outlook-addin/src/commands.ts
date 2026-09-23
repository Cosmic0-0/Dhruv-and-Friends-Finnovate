// Outlook requires a function-file document for command surfaces even when
// the only command is ShowTaskpane. Initialising Office keeps that host page
// valid without registering any mailbox-mutating action.
Office.onReady(() => undefined);
