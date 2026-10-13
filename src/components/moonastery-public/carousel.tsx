import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function ContentCarousel({ label, children }: { label: string; children: ReactNode }) {
  const [ref, api] = useEmblaCarousel({ align: "start", containScroll: "trimSnaps" });
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const update = useCallback(() => {
    setCanPrev(api?.canScrollPrev() ?? false);
    setCanNext(api?.canScrollNext() ?? false);
  }, [api]);
  useEffect(() => {
    if (!api) return;
    update();
    api.on("select", update).on("reInit", update);
    return () => {
      api.off("select", update).off("reInit", update);
    };
  }, [api, update]);
  return (
    <div
      className="moon-carousel"
      role="region"
      aria-roledescription="carrossel"
      aria-label={label}
    >
      <div className="moon-carousel-controls">
        <button
          type="button"
          aria-label={`Anterior em ${label}`}
          disabled={!canPrev}
          onClick={() => api?.scrollPrev()}
        >
          <ChevronLeft aria-hidden="true" size={20} />
        </button>
        <button
          type="button"
          aria-label={`Próximo em ${label}`}
          disabled={!canNext}
          onClick={() => api?.scrollNext()}
        >
          <ChevronRight aria-hidden="true" size={20} />
        </button>
      </div>
      <div className="moon-carousel-window" ref={ref}>
        <div className="moon-carousel-track">{children}</div>
      </div>
    </div>
  );
}
