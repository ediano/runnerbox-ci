"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mergeUsage } from "@/lib/usage";

// Cada medição de CPU leva ~1 s no daemon; o disco (`size` + `df`) é bem mais caro.
const USAGE_INTERVAL_MS = 10_000;
const DISK_INTERVAL_MS = 60_000;

// Polling do consumo, compartilhado pela aba de runners (só CPU e memória, para a
// coluna da tabela) e pela aba de consumo, que também mede o disco.
export default function useUsage({ withDisk = false } = {}) {
  const [usage, setUsage] = useState(null);
  const [error, setError] = useState(null);
  const [measuringDisk, setMeasuringDisk] = useState(false);
  // Evita empilhar medições quando o daemon demora mais que o intervalo.
  const inFlight = useRef(false);
  const lastDiskAt = useRef(0);

  const refresh = useCallback(
    async (forceDisk = false) => {
      if (inFlight.current) return;
      inFlight.current = true;
      const disk = forceDisk || (withDisk && Date.now() - lastDiskAt.current >= DISK_INTERVAL_MS);
      if (disk) setMeasuringDisk(true);
      try {
        const response = await fetch(`/api/usage${disk ? "?disk=1" : ""}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to measure resource usage.");
        if (disk) lastDiskAt.current = Date.now();
        setUsage((prev) => mergeUsage(prev, data));
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        inFlight.current = false;
        if (disk) setMeasuringDisk(false);
      }
    },
    [withDisk]
  );

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, USAGE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  return { usage, error, measuringDisk, measureDisk: () => refresh(true) };
}
