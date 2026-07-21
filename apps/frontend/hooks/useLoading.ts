// frontend/src/shared/hooks/useLoading.js
import { useState, useCallback } from "react";

export default function useLoading() {
  const [isFetching, setIsFetching] = useState(false);

  // fetch（ページ初期ロード）用
  const startFetching = useCallback(() => {
    setIsFetching(true);
  }, []);

  const stopFetching = useCallback(() => {
    setIsFetching(false);
  }, []);

  return {
    isFetching,
    startFetching,
    stopFetching,
  };
}
