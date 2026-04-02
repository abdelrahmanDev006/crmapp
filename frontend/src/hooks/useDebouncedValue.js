import { useEffect, useState } from "react";

export function useDebouncedValue(value, delayMs = 350) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [delayMs, value]);

  return debouncedValue;
}
