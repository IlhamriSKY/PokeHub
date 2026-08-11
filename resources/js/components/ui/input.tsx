import * as React from 'react';

import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(({ className, type, ...props }, ref) => {
    return (
        <input
            type={type}
            className={cn(
                'flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
                /*
                 * A file picker, dressed with `::file-selector-button` rather than the usual hidden
                 * input behind a styled label. There is one file field in the app; a dropzone
                 * component would be more code AND would give up the native control's keyboard
                 * behaviour and its "no file chosen" state for nothing.
                 *
                 * The button takes the field's whole left edge as a quiet prefix segment, which is
                 * why the field drops its own vertical and left padding for this type only. Without
                 * that, `file:h-full` measures against a box the padding has already shortened and
                 * the button sits floating in the middle with the text baseline off.
                 */
                '[&[type=file]]:cursor-pointer [&[type=file]]:py-0 [&[type=file]]:pl-0 [&[type=file]]:text-sm',
                'file:mr-3 file:h-full file:cursor-pointer file:border-0 file:border-r file:border-input file:bg-muted file:px-3 file:text-xs file:font-medium file:text-foreground',
                'hover:file:bg-accent hover:file:text-accent-foreground',
                className,
            )}
            ref={ref}
            {...props}
        />
    );
});

Input.displayName = 'Input';

export { Input };
