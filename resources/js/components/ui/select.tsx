import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp, Search } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * When the window was last resized.
 *
 * Registered at module load, which is what makes it work: Radix adds its own resize listener when a
 * menu opens, so ours is always the earlier one and the stamp is already fresh by the time Radix
 * asks to close. See {@link Select}.
 */
let lastResize = -Infinity;
if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => {
        lastResize = performance.now();
    });
}

/** How long after a resize a close is treated as that resize's doing. The two are the same tick. */
const RESIZE_GRACE_MS = 50;

/**
 * Radix's Select, minus its habit of closing itself on `window.resize`.
 *
 * That listener (react-select's SelectContentImpl: `window.addEventListener('resize', close)`) is
 * why every dropdown shut by itself on a phone. The on-screen keyboard IS a resize there, so the
 * filter box below could never be used: the menu vanished the instant the keyboard slid up. Radix
 * Select is also the ONLY @radix-ui package carrying that listener, which is why the menus built on
 * DropdownMenu were fine and every one of these was not.
 *
 * So the close is what gives, not the filter box - thirty-one rarities is not a list anyone should
 * have to scroll blind. A resize cannot leave the menu stranded anyway: it is positioned by Floating
 * UI, which repositions it on that same resize.
 *
 * The Root has to be CONTROLLED for this to bite. Uncontrolled, Radix keeps the open state itself
 * and `onOpenChange` is only a notification - returning early from it would close the menu anyway.
 */
function Select({ open, defaultOpen, onOpenChange, ...props }: React.ComponentProps<typeof SelectPrimitive.Root>) {
    const [self, setSelf] = React.useState(defaultOpen ?? false);
    const isOpen = open ?? self;

    return (
        <SelectPrimitive.Root
            {...props}
            open={isOpen}
            onOpenChange={(next) => {
                if (!next && performance.now() - lastResize < RESIZE_GRACE_MS) return;
                if (open === undefined) setSelf(next);
                onOpenChange?.(next);
            }}
        />
    );
}

const SelectGroup = SelectPrimitive.Group;

const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
    React.ElementRef<typeof SelectPrimitive.Trigger>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
    <SelectPrimitive.Trigger
        ref={ref}
        className={cn(
            'flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
            className,
        )}
        {...props}
    >
        {children}
        <SelectPrimitive.Icon asChild>
            <ChevronDown className="h-4 w-4 opacity-50" />
        </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
    React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
    <SelectPrimitive.ScrollUpButton ref={ref} className={cn('flex cursor-default items-center justify-center py-1', className)} {...props}>
        <ChevronUp className="h-4 w-4" />
    </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
    React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
    <SelectPrimitive.ScrollDownButton ref={ref} className={cn('flex cursor-default items-center justify-center py-1', className)} {...props}>
        <ChevronDown className="h-4 w-4" />
    </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

/**
 * The open menu's filter text, shared with the items so each one can hide itself.
 *
 * A searchable dropdown lives HERE rather than in a separate Combobox component that every call
 * site would have to opt into: there are ~25 dropdowns across seven files, several of them
 * choosing between thirty-one rarities or every card asset in the database, and a second
 * component would have meant converting all of them and keeping two dropdown styles alive in the
 * meantime. Filtering inside the shared Select means every one of them gained search at once,
 * and none of the call sites changed.
 */
const FilterContext = React.createContext('');

/**
 * Does focusing an input on this device raise an on-screen keyboard?
 *
 * It gates the filter box's AUTOFOCUS only - the box itself is on every dropdown, phone included
 * (see {@link Select} for what used to make that impossible). Grabbing focus on open would raise
 * the keyboard over the options before anyone asked to search, so a phone opens on the list and
 * takes the keyboard when the box is tapped.
 *
 * Read once at module load rather than through a hook: a device does not grow a mouse mid-session,
 * and Select mounts its content only while open, so there is no server markup to mismatch.
 */
const TOUCH_KEYBOARD = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;

/** A node's visible text, so an item can be matched on what the user actually reads. */
function text(node: React.ReactNode): string {
    if (node === null || node === undefined || typeof node === 'boolean') return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(text).join(' ');
    if (React.isValidElement(node)) return text((node.props as { children?: React.ReactNode }).children);

    return '';
}

/** Does this child - an item, or a group of them - still have anything to show? */
function matches(node: React.ReactNode, query: string): boolean {
    if (!React.isValidElement(node)) return false;
    const kids = (node.props as { children?: React.ReactNode }).children;
    const own = text(node).toLowerCase().includes(query.toLowerCase());

    return own || React.Children.toArray(kids).some((k) => matches(k, query));
}

/** Shown when the filter leaves nothing. */
function Empty() {
    return <div className="text-muted-foreground py-6 text-center text-sm">No match.</div>;
}

/**
 * EVERY dropdown gets the search box, with no minimum option count.
 *
 * There used to be a threshold of eight, on the reasoning that a search box over a three-item list
 * is clutter. It was dropped on purpose: one dropdown behaving differently from the one beside it is
 * the more expensive kind of surprise, because it makes you check each menu instead of trusting all
 * of them. The five short pickers in the card lab (Generation, Rule, Subtype, Badge, Tag) were the
 * only ones without it, and were exactly the ones that read as broken.
 */
const SelectContent = React.forwardRef<
    React.ElementRef<typeof SelectPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => {
    const [query, setQuery] = React.useState('');

    return (
    <SelectPrimitive.Portal>
        <SelectPrimitive.Content
            ref={ref}
            className={cn(
                'relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
                position === 'popper' &&
                    'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
                className,
            )}
            position={position}
            {...props}
        >
            <div
                className="flex items-center gap-2 border-b px-2"
                onKeyDown={(e) => {
                    // Printable keys stay in the box. Letting them through drives Radix's own
                    // typeahead, which jumps the highlight to whatever starts with that letter
                    // half way through a word.
                    if (e.key.length === 1) {
                        e.stopPropagation();

                        return;
                    }

                    // Arrows hand over to the list. Radix navigates by moving focus from one item
                    // to the next, and has no item to move FROM while focus sits in this input - so
                    // an arrow press did nothing at all, and a dropdown was mouse-only from the
                    // moment the box took focus. Focusing an end of the list gives Radix the anchor
                    // it needs and Enter then selects through Radix itself. Only options that
                    // survived the filter are in the DOM, so this lands on a row that is visible.
                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                        const items = e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="option"]');
                        const edge = items?.length ? items[e.key === 'ArrowDown' ? 0 : items.length - 1] : null;
                        if (edge) {
                            e.preventDefault();
                            e.stopPropagation();
                            edge.focus();
                        }
                    }
                }}
            >
                <Search className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                <input
                    // Radix owns keyboard focus inside an open Select and steers letters into its
                    // own typeahead. Autofocusing on the next frame wins that race. Not on a phone,
                    // where taking focus means the keyboard covers the options nobody has asked to
                    // filter yet - see TOUCH_KEYBOARD.
                    ref={(el) => {
                        if (el && !TOUCH_KEYBOARD) requestAnimationFrame(() => el.focus());
                    }}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search..."
                    aria-label="Filter options"
                    className="placeholder:text-muted-foreground h-8 w-full bg-transparent text-sm outline-hidden"
                />
            </div>
            <SelectScrollUpButton />
            <SelectPrimitive.Viewport
                className={cn(
                    'p-1',
                    position === 'popper' && 'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]',
                )}
            >
                <FilterContext.Provider value={query}>{children}</FilterContext.Provider>
                {/* Counted here rather than left to the items: each one hides itself, so this is
                    the only place that can tell whether any of them survived the filter. */}
                {query !== '' && !React.Children.toArray(children).some((c) => matches(c, query)) && <Empty />}
            </SelectPrimitive.Viewport>
            <SelectScrollDownButton />
        </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
    );
});
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Label>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>>(
    ({ className, ...props }, ref) => (
        <SelectPrimitive.Label ref={ref} className={cn('py-1.5 pl-8 pr-2 text-sm font-semibold', className)} {...props} />
    ),
);
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Item>, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>>(
    ({ className, children, ...props }, ref) => {
        const query = React.useContext(FilterContext);
        // Matched on the item's own rendered text, so a caller passing an icon beside a label is
        // still searchable by the label without every call site declaring a search key.
        if (query && !text(children).toLowerCase().includes(query.toLowerCase())) {
            return null;
        }

        return (
        <SelectPrimitive.Item
            ref={ref}
            className={cn(
                'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-hidden focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50',
                className,
            )}
            {...props}
        >
            <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                <SelectPrimitive.ItemIndicator>
                    <Check className="h-4 w-4" />
                </SelectPrimitive.ItemIndicator>
            </span>

            <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
        </SelectPrimitive.Item>
        );
    },
);
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
    React.ElementRef<typeof SelectPrimitive.Separator>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => <SelectPrimitive.Separator ref={ref} className={cn('-mx-1 my-1 h-px bg-muted', className)} {...props} />);
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectScrollDownButton,
    SelectScrollUpButton,
    SelectSeparator,
    SelectTrigger,
    SelectValue,
};
