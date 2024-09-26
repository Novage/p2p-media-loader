import { useState, useEffect, useCallback, useRef } from "react";
import { DEFAULT_STREAM, DEFAULT_TRACKERS, PLAYERS } from "../constants";

type QueryParamsType = Record<string, string>;

const defaultParams: QueryParamsType = {
  player: Object.keys(PLAYERS)[0],
  streamUrl: DEFAULT_STREAM,
  trackers: DEFAULT_TRACKERS,
  debug: "",
  swarmId: "",
};

function getInitialParams(searchParams: URLSearchParams): QueryParamsType {
  return Object.keys(defaultParams).reduce((params, key) => {
    params[key] = searchParams.get(key) ?? defaultParams[key];
    return params;
  }, {} as QueryParamsType);
}

export function useQueryParams() {
  const searchParamsRef = useRef(new URLSearchParams(window.location.search));
  const [queryParams, setQueryParams] = useState<QueryParamsType>(() =>
    getInitialParams(searchParamsRef.current),
  );

  const updateQueryParamsFromURL = useCallback(() => {
    const searchParams = searchParamsRef.current;
    const newParams = getInitialParams(searchParams);

    setQueryParams((prevParams) => {
      const hasChanges = Object.keys(newParams).some(
        (key) => prevParams[key] !== newParams[key],
      );
      return hasChanges ? newParams : prevParams;
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

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [updateQueryParamsFromURL]);

  return { queryParams, setURLQueryParams };
}
