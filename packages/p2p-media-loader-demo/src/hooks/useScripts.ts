import { useEffect } from "react";

const generateUniqueId = () => {
  return `script-${Math.random().toString(36).substring(2, 11)}`;
};

const loadScript = (script: { url: string; id: string }) => {
  const { url, id } = script;

  return new Promise((resolve, reject) => {
    const scriptElement = document.createElement("script");

    scriptElement.src = url;
    scriptElement.async = true;
    scriptElement.type = "text/javascript";
    scriptElement.setAttribute("data-id", id);
    scriptElement.onload = () => resolve(scriptElement);
    scriptElement.onerror = () => reject(new Error(`Failed to load script: ${url}`));

    document.body.appendChild(scriptElement);
  });
};

export const useScripts = (scripts: string[]) => {
  useEffect(() => {
    let isCleanup = false;

    const scriptsWithIds = scripts.map((script) => ({
      url: script,
      id: generateUniqueId(),
    }));

    const cleanUp = () => {
      isCleanup = true;
      scriptsWithIds.forEach(({ id }) => {
        const scriptElement = document.querySelector(`script[data-id="${id}"]`);
        if (scriptElement) {
          document.body.removeChild(scriptElement);
        }
      });
    };

    const loadAllScripts = async () => {
      for (const script of scriptsWithIds) {
        await loadScript(script);
        if (isCleanup) {
          cleanUp();
          break;
        }
      }
    };

    void loadAllScripts();

    return () => cleanUp();
  }, [scripts]);
};
