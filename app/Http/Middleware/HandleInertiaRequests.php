<?php

namespace App\Http\Middleware;

use App\Support\Seo;
use Illuminate\Foundation\Inspiring;
use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        [$message, $author] = str(Inspiring::quotes()->random())->explode('-');

        $user = $request->user();

        return [
            ...parent::share($request),
            'name' => config('app.name'),
            'quote' => ['message' => trim($message), 'author' => trim($author)],
            'auth' => [
                'user' => $user,
                // Closures: Inertia skips them on a partial reload, saving the permission queries.
                'roles' => fn () => $user ? $user->getRoleNames() : [],
                'permissions' => fn () => $user ? $user->getAllPermissions()->pluck('name') : [],
                'is_admin' => fn () => $user ? $user->hasRole('admin') : false,
                'has_password' => (bool) ($user?->password),
            ],
            'turnstile' => [
                'enabled' => (bool) config('services.turnstile.enabled'),
                'site_key' => config('services.turnstile.site_key'),
            ],
            // Default metadata for any page that does not set its own. Shared rather than repeated
            // per controller so a new page is indexable-and-describable by default instead of
            // shipping an empty <head>.
            'seo' => Seo::make(),
            'flash' => [
                'status' => $request->session()->get('status'),
                'success' => $request->session()->get('success'),
                'error' => $request->session()->get('error'),
            ],
        ];
    }
}
