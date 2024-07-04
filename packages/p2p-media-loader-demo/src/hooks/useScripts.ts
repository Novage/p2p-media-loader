import { useEffect } from "react";

const loadScript = (url: string): Promise<HTMLScriptElement> => {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.type = "text/javascript";
    script.onload = () => resolve(script);
    script.onerror = (error) => reject(error);
    document.body.appendChild(script);
  });
};
export const useScripts = (scripts: string[]) => {
  useEffect(() => {
    let isCleanup = false;

    const loadAllScripts = async () => {
      for (const script of scripts) {
        await loadScript(script);
        if (isCleanup) break;
      }
    };

    void loadAllScripts();

    return () => {
      isCleanup = true;
      scripts.forEach((url) => {
        const scriptElement = document.querySelector(`script[src="${url}"]`);
        if (scriptElement) {
          document.body.removeChild(scriptElement);
        }
      });
    };
  }, [scripts]);
};
