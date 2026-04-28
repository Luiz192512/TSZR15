import { groupConfiguratorProductsBySlot, renderSlots } from "@/src/catalog/index.js";

export function GET() {
  return Response.json({
    renderSlots,
    slotGroups: groupConfiguratorProductsBySlot()
  });
}
