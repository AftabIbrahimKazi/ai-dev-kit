export type ThemeName = "light" | "dark";

export const THEME_STORAGE_KEY = "theme" as const;
export const THEME_DEFAULT: ThemeName = "light";

export const THEME_INIT_SCRIPT: string = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t!=="light"&&t!=="dark"){t="${THEME_DEFAULT}"}document.documentElement.dataset.stTheme=t}catch(e){}`;
