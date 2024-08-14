import { useEffect, useState } from "react";

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
    scriptElement.onerror = (error) => reject(error);

    document.body.appendChild(scriptElement);
  });
};

export const useScripts = (scripts: string[]) => {
  const [areScriptsLoaded, setAreScriptsLoaded] = useState(false);

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
      try {
        for (const script of scriptsWithIds) {
          await loadScript(script);
          if (isCleanup) {
            cleanUp();
            break;
          }
        }
        if (!isCleanup) setAreScriptsLoaded(true);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Error loading scripts", error);
      }
    };

    void loadAllScripts();

    return () => cleanUp();
  }, [scripts]);

  return areScriptsLoaded;
};
