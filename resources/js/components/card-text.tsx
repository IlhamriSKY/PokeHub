import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { type ComponentProps, type ReactNode } from 'react';

// Local, not a new ui/ primitive: two fields on one screen do not earn a shared component.
// Classes mirror ui/input.tsx so the two line up in a form.
function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
    return (
        <textarea
            className={cn(
                'border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex w-full resize-y rounded-md border px-3 py-2 text-base focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
                className,
            )}
            {...props}
        />
    );
}

export type Attack = { name: string; cost: number; damage: string; desc: string };
export type CardText = {
    name: string;
    species: string;
    flavor: string;
    effect: string;
    attacks: Attack[];
    /** Showcase cards only: the caption printed under the card on the landing page. */
    why?: string;
};

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
    return (
        <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
                <Label className="text-muted-foreground text-xs">{label}</Label>
                {hint && <span className="text-muted-foreground/70 text-[10px] tabular-nums">{hint}</span>}
            </div>
            {children}
        </div>
    );
}

/**
 * The card's prose, straight from the row that renders it. Every limit here matches the server's
 * validation AND the printed box on the frame - these are fixed-size plates, so an over-long
 * string overflows the art instead of wrapping.
 */
export function CardText({ text, onChange, showWhy }: { text: CardText; onChange: (next: CardText) => void; showWhy: boolean }) {
    const set = (patch: Partial<CardText>) => onChange({ ...text, ...patch });

    const setAttack = (i: number, patch: Partial<Attack>) => {
        const attacks = [...text.attacks];
        while (attacks.length <= i) attacks.push({ name: '', cost: 1, damage: '', desc: '' });
        attacks[i] = { ...attacks[i], ...patch };
        set({ attacks });
    };

    const attack = (i: number): Attack => text.attacks[i] ?? { name: '', cost: 1, damage: '', desc: '' };

    return (
        <div className="space-y-3">
            <Field label="Card name" hint={`${text.name.length}/60`}>
                <Input className="h-9" maxLength={60} value={text.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>

            {showWhy && (
                <Field label="Homepage caption" hint={`${(text.why ?? '').length}/120`}>
                    <Input
                        className="h-9"
                        maxLength={120}
                        value={text.why ?? ''}
                        placeholder="Created Linux and Git."
                        onChange={(e) => set({ why: e.target.value })}
                    />
                </Field>
            )}

            <Field label="Species / subtitle" hint={`${text.species.length}/22`}>
                <Input className="h-9" maxLength={22} value={text.species} onChange={(e) => set({ species: e.target.value })} />
            </Field>

            <Field label="Flavor text" hint={`${text.flavor.length}/200`}>
                <Textarea rows={2} maxLength={200} value={text.flavor} onChange={(e) => set({ flavor: e.target.value })} />
            </Field>

            {/* Trainer faces have no attacks, so this plate carries all of their prose. */}
            <Field label="Trainer effect text" hint={`${text.effect.length}/300`}>
                <Textarea rows={2} maxLength={300} value={text.effect} onChange={(e) => set({ effect: e.target.value })} />
            </Field>

            {[0, 1].map((i) => (
                <div key={i} className="space-y-2 rounded-lg border p-3">
                    <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">Attack {i + 1}</p>
                    <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                            <Field label="Name" hint={`${attack(i).name.length}/16`}>
                                <Input
                                    className="h-9"
                                    maxLength={16}
                                    value={attack(i).name}
                                    onChange={(e) => setAttack(i, { name: e.target.value })}
                                />
                            </Field>
                        </div>
                        <Field label="Damage">
                            <Input
                                className="h-9"
                                maxLength={5}
                                value={attack(i).damage}
                                onChange={(e) => setAttack(i, { damage: e.target.value })}
                            />
                        </Field>
                        <Field label="Energy cost">
                            <Input
                                className="h-9"
                                type="number"
                                min={1}
                                max={4}
                                value={attack(i).cost}
                                onChange={(e) => setAttack(i, { cost: Math.max(1, Math.min(4, Number(e.target.value) || 1)) })}
                            />
                        </Field>
                        <div className="col-span-2">
                            <Field label="Effect text" hint={`${attack(i).desc.length}/300`}>
                                <Input
                                    className="h-9"
                                    maxLength={300}
                                    value={attack(i).desc}
                                    onChange={(e) => setAttack(i, { desc: e.target.value })}
                                />
                            </Field>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
