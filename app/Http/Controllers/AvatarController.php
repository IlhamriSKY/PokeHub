<?php

namespace App\Http\Controllers;

use App\Services\AvatarCache;
use Illuminate\Http\Request;

/**
 * `GET /avatar/{login}?s=360` - the card's face, from our disk instead of GitHub's CDN.
 *
 * Deliberately NOT throttled. The key space is already bounded to logins we have stored times the
 * four sizes the card renders (see AvatarCache), so there is nothing here to walk; a hit is one
 * file read, which is cheaper than the page that asked for it. A per-IP limit would instead break
 * the exact case this endpoint exists for - a whole school or office behind one address, loading a
 * gallery of cards.
 */
class AvatarController extends Controller
{
    public function show(Request $request, string $login, AvatarCache $avatars)
    {
        $size = AvatarCache::size($request->query('s'));
        $path = $avatars->ensure($login, $size);

        if ($path === null) {
            // Nothing stored and nothing storable. If we at least know where the picture lives,
            // hand the browser to GitHub - that is what the card did before this cache, so a
            // failed download can only ever be as bad as the old behaviour, never worse.
            $upstream = $avatars->upstream($login, $size);
            abort_if($upstream === null, 404);

            return redirect()->away($upstream);
        }

        // A day, against the 300 seconds GitHub allows on the same bytes. The picture is only
        // re-read after a regenerate (which calls forget) or the service's own weekly TTL, so a
        // long browser cache cannot show a face that is meaningfully out of date.
        $response = response()->file($path, [
            'Cache-Control' => 'public, max-age=86400, s-maxage=86400',
        ]);
        $response->setAutoLastModified();
        $response->setAutoEtag();
        $response->isNotModified($request);

        return $response;
    }
}
