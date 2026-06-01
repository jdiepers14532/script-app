/**
 * useDnd — geteilter @dnd-kit-Wrapper für Future-Board und Rollen-Einsatz (Gantt).
 *
 * Sensor-Setup: PointerSensor (Mouse + Touch via Pointer Events API) +
 * KeyboardSensor für Barrierefreiheit. Beide Nutzer dieses Hooks bekommen
 * dieselbe Aktivierungsschwelle und dasselbe Verhalten.
 */
import { useSensor, useSensors, PointerSensor, KeyboardSensor } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

export interface DndSensorsOptions {
  /** Mindestbewegung in Pixeln, bevor ein Drag startet. Default: 5 */
  activationDistance?: number
}

/** Vorkonfigurierter Sensor-Hook — in Future-Board und Gantt identisch einsetzen */
export function useDndSensors(options?: DndSensorsOptions) {
  return useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: options?.activationDistance ?? 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )
}

// ── Re-Exporte für konsistente Imports in allen Planung-Komponenten ──────────
export {
  DndContext,
  closestCenter,
  closestCorners,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'

export {
  SortableContext,
  useSortable,
  arrayMove,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  rectSortingStrategy,
} from '@dnd-kit/sortable'

export { CSS } from '@dnd-kit/utilities'
