import type { AppServices } from "@/lib/contracts";
import { createLocalServices } from "@/lib/storage/local-services";

let services: AppServices | null = null;

/** Pages configure Firebase through SignedIn. The local store is only a fallback for tests. */
export function getServices(): AppServices {
  services ??= createLocalServices();
  return services;
}

/** Called once someone has signed in. */
export function configureServices(next: AppServices): void {
  services = next;
}
