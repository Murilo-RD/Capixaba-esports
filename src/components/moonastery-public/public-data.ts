import { useQuery } from "@tanstack/react-query";
import { publicHome } from "@/lib/moonastery/client";

export function usePublicHome() {
  return useQuery({
    queryKey: ["moonastery", "public-home"],
    queryFn: publicHome,
    staleTime: 60_000,
    retry: 1,
  });
}
