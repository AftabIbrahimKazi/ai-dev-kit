"use client";

import { useEffect } from "react";

export default function StrataPackages(): null {
  useEffect(() => {
    import("@strata-packages/offcanvas").catch(() => undefined);
  }, []);

  return null;
}
