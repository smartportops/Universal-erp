import { chrome } from "@/i18n/chrome";
import { commerce } from "@/i18n/commerce";
import { inventory } from "@/i18n/inventory";
import { platform } from "@/i18n/platform";

export const dictionary: Record<string, string> = { ...chrome, ...commerce, ...inventory, ...platform };
