import { INTRO_ATTRIBUTE, INTRO_PLAY, REDUCED_MOTION_QUERY } from "@/stage/stage-config";

export const INTRO_STORAGE_KEY = "intro-seen" as const;

export const INTRO_INIT_SCRIPT: string = `try{if(location.pathname==="/"&&!localStorage.getItem("${INTRO_STORAGE_KEY}")&&!matchMedia("${REDUCED_MOTION_QUERY}").matches){document.documentElement.setAttribute("${INTRO_ATTRIBUTE}","${INTRO_PLAY}")}}catch(e){}`;
