import type { AppServices } from "@/lib/contracts";
import { createLocalServices } from "@/lib/storage/local-services";

let services: AppServices | null = null;

/** Until Firebase is connected, the bank lives in this browser under a local profile. */
export function getServices(): AppServices {
  services ??= createLocalServices();
  return services;
}

/** Terminal 1 calls this once at start-up with the Firebase implementations. */
export function configureServices(next: AppServices): void {
  services = next;
}
