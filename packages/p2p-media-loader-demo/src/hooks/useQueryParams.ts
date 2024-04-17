import { useState, useEffect, useCallback, useRef } from "react";
import { DEFAULT_STREAM, DEFAULT_TRACKERS, PLAYERS } from "../constants";

type QueryParamsType = Record<string, string>;

const defaultParams: QueryParamsType = {
  player: PLAYERS[0],
  streamUrl: DEFAULT_STREAM,
  trackers: DEFAULT_TRACKERS,
};

export function useQueryParams() {
  const searchParamsRef = useRef(new URLSearchParams(window.location.search));
  const [queryParams, setQueryParams] =
    useState<QueryParamsType>(defaultParams);

  const updateQueryParamsFromURL = useCallback(() => {
    const searchParams = searchParamsRef.current;
    const paramsObj: QueryParamsType = {};

    setQueryParams((prevParams) => {
      let hasChanges = false;

      Object.keys(defaultParams).forEach((key) => {
        const newValue = searchParams.get(key) ?? defaultParams[key];
        paramsObj[key] = newValue;

        if (prevParams[key] !== newValue) {
          hasChanges = true;
        }
      });

      return hasChanges ? paramsObj : prevParams;
    });
  }, []);

  const setURLQueryParams = useCallback(
    (newParams: Partial<QueryParamsType>) => {
      const searchParams = searchParamsRef.current;

      Object.entries(newParams).forEach(([key, value]) => {
        if (
          value === null ||
          value === undefined ||
          value === defaultParams[key]
        ) {
          searchParams.delete(key);
        } else {
          searchParams.set(key, value);
        }
      });

      const newUrl =
        searchParams.toString() === ""
          ? window.location.pathname
          : `${window.location.pathname}?${searchParams.toString()}`;
      window.history.pushState({}, "", newUrl);

      updateQueryParamsFromURL();
    },
    [updateQueryParamsFromURL],
  );

  useEffect(() => {
    const handlePopState = () => {
      searchParamsRef.current = new URLSearchParams(window.location.search);
      updateQueryParamsFromURL();
    };

    updateQueryParamsFromURL();
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [updateQueryParamsFromURL]);

  return { queryParams, setURLQueryParams };
}
