export const GLOBAL_SAVE_SHORTCUT_EVENT = "lawsaw:save-shortcut";

export type GlobalSaveShortcutDetail = {
	pathname: string;
	trigger: "keyboard";
	timestamp: number;
};
