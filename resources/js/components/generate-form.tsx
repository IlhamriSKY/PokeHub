import { Turnstile } from '@/components/turnstile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import WaitLine from '@/components/wait-line';
import type { SharedData } from '@/types';
import { useForm, usePage } from '@inertiajs/react';
import { Loader2, Search } from 'lucide-react';
import { type FormEvent } from 'react';

/**
 * The home page's search box: any GitHub handle, no account required.
 *
 * One endpoint covers both halves of the flow, because only the server knows whether the card
 * already exists. A handle someone has searched before comes back instantly; a new one waits on
 * the AI, which is what WaitLine is here for.
 *
 * @see App\Http\Controllers\GenerateCardController
 */
export default function GenerateForm() {
    const { turnstile } = usePage<SharedData>().props;
    const { data, setData, post, processing, errors } = useForm({ login: '', 'cf-turnstile-response': '' });

    const needsCaptcha = !!turnstile?.enabled && !!turnstile?.site_key;
    const blocked = processing || !data.login.trim() || (needsCaptcha && !data['cf-turnstile-response']);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        if (blocked) return;
        post('/generate', {
            // Errors come back as a redirect to this same page; without these the answer would
            // scroll the visitor to the top and wipe what they typed.
            preserveScroll: true,
            preserveState: true,
            onFinish: () => {
                // Tokens are single-use, so the widget has to be reset before the next submit.
                window.turnstile?.reset();
                setData('cf-turnstile-response', '');
            },
        });
    };

    return (
        <form onSubmit={submit} className="mx-auto mt-7 w-full max-w-md">
            <div className="flex flex-col gap-2.5 sm:flex-row">
                <div className="relative flex-1">
                    {/* The @ is decoration, not part of the value. People type it either way, and
                        a pasted github.com URL carries more still; the server would 422 on both. */}
                    <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm">@</span>
                    <Input
                        value={data.login}
                        onChange={(e) =>
                            setData(
                                'login',
                                e.target.value
                                    .trim()
                                    .replace(/^@/, '')
                                    .replace(/^https?:\/\/(?:www\.)?github\.com\//i, '')
                                    .replace(/\/.*$/, ''),
                            )
                        }
                        name="login"
                        placeholder="github-username"
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        aria-label="GitHub username"
                        aria-invalid={!!errors.login}
                        disabled={processing}
                        className="h-12 pl-7 text-base"
                    />
                </div>
                <Button type="submit" size="lg" disabled={blocked} className="h-12 gap-2 px-6 text-base">
                    {processing ? (
                        <>
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                            <WaitLine />
                        </>
                    ) : (
                        <>
                            <Search className="h-4 w-4 shrink-0" />
                            Get the card
                        </>
                    )}
                </Button>
            </div>

            {/* Renders nothing when Turnstile is off, so local dev needs no keys. */}
            <div className="mt-3">
                <Turnstile onVerify={(t) => setData('cf-turnstile-response', t)} />
            </div>

            {errors.login && <p className="mt-3 text-sm font-medium text-red-600 dark:text-red-400">{errors.login}</p>}
            {errors['cf-turnstile-response'] && (
                <p className="mt-3 text-sm font-medium text-red-600 dark:text-red-400">{errors['cf-turnstile-response']}</p>
            )}

            <p className="text-muted-foreground mt-3 text-xs text-pretty">
                {processing
                    ? 'First card for this handle. The AI writes the flavour text and both attacks, which takes up to two minutes.'
                    : 'No sign-in needed. Already searched by someone else? You get that card instantly.'}
            </p>
        </form>
    );
}
