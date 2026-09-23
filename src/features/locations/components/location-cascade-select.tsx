import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useLocationChildren, useProvinces } from '@/features/locations/use-locations'

/**
 * Province → District → Sector, each level fetched from the one above.
 *
 * The values are **location UUIDs**, not names — the API rejects a name with
 * `Must be a valid UUID`.
 *
 * Each level is fetched only once its parent is chosen, so opening a form does
 * not pull the whole 17k-row tree.
 *
 * Choosing a level **clears everything below it**, so a district can never
 * survive its province being switched — that is handled in `onValueChange`
 * rather than an effect, since the change always originates from a selection.
 */
export function LocationCascadeSelect({
  province,
  district,
  sector,
  onChange,
  errors,
  disabled,
}: {
  province: string
  district: string
  sector: string
  /** Called with the level that changed and its new id. */
  onChange: (level: 'province' | 'district' | 'sector', id: string) => void
  errors?: Partial<Record<'province' | 'district' | 'sector', string | undefined>>
  disabled?: boolean
}) {
  const { provinces, isLoading: loadingProvinces } = useProvinces()
  const { locations: districts, isLoading: loadingDistricts } = useLocationChildren(province)
  const { locations: sectors, isLoading: loadingSectors } = useLocationChildren(district)

  const levels = [
    {
      key: 'province' as const,
      label: 'Province',
      value: province,
      options: provinces,
      isLoading: loadingProvinces,
      // The roots are always available, so this is never blocked.
      blockedBy: null as string | null,
    },
    {
      key: 'district' as const,
      label: 'District',
      value: district,
      options: districts,
      isLoading: loadingDistricts,
      blockedBy: province ? null : 'Choose a province first',
    },
    {
      key: 'sector' as const,
      label: 'Sector',
      value: sector,
      options: sectors,
      isLoading: loadingSectors,
      blockedBy: district ? null : 'Choose a district first',
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {levels.map((level) => (
        <div key={level.key} className="grid gap-1.5">
          <Label htmlFor={level.key}>{level.label}</Label>
          <Select
            value={level.value}
            disabled={disabled || Boolean(level.blockedBy) || level.isLoading}
            onValueChange={(v) => {
              onChange(level.key, v)
              // Selecting a new parent invalidates everything under it.
              if (level.key === 'province') {
                onChange('district', '')
                onChange('sector', '')
              }
              if (level.key === 'district') onChange('sector', '')
            }}
          >
            <SelectTrigger id={level.key}>
              <SelectValue placeholder={level.isLoading ? 'Loading…' : `Select ${level.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {level.options.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors?.[level.key] ? (
            <p className="text-sm text-destructive">{errors[level.key]}</p>
          ) : level.blockedBy ? (
            <p className="text-xs text-muted-foreground">{level.blockedBy}</p>
          ) : !level.isLoading && level.options.length === 0 ? (
            // An empty array is a valid answer here, not a failure.
            <p className="text-xs text-muted-foreground">Nothing below this level.</p>
          ) : null}
        </div>
      ))}
    </div>
  )
}
