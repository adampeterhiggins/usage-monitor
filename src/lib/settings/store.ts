import { openDocumentStore } from "../../platform/persistence";

export const settingsStore = openDocumentStore("settings.json");
