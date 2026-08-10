<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">

        @php
            // Printed HERE, from a server prop, because Inertia's <Head> only writes tags after the
            // bundle hydrates and no crawler or link-preview scraper runs it. See App\Support\Seo.
            $seo = data_get($page, 'props.seo', []);
        @endphp

        <title inertia>{{ $seo['title'] ?? config('app.name', 'PokeHub') }}</title>
        <meta name="description" content="{{ $seo['description'] ?? '' }}">
        <meta name="robots" content="{{ $seo['robots'] ?? 'index, follow' }}">
        <link rel="canonical" href="{{ $seo['canonical'] ?? url()->current() }}">

        <meta property="og:site_name" content="{{ config('app.name', 'PokeHub') }}">
        <meta property="og:type" content="{{ $seo['type'] ?? 'website' }}">
        <meta property="og:title" content="{{ $seo['title'] ?? '' }}">
        <meta property="og:description" content="{{ $seo['description'] ?? '' }}">
        <meta property="og:url" content="{{ $seo['canonical'] ?? url()->current() }}">
        <meta property="og:locale" content="en_US">
        @if (! empty($seo['image']))
            <meta property="og:image" content="{{ $seo['image'] }}">
            <meta property="og:image:type" content="{{ $seo['imageType'] ?? 'image/png' }}">
            <meta property="og:image:width" content="{{ $seo['imageWidth'] ?? 1200 }}">
            <meta property="og:image:height" content="{{ $seo['imageHeight'] ?? 630 }}">
            <meta property="og:image:alt" content="{{ $seo['imageAlt'] ?? '' }}">
        @endif

        <meta name="twitter:card" content="{{ $seo['twitterCard'] ?? 'summary_large_image' }}">
        <meta name="twitter:title" content="{{ $seo['title'] ?? '' }}">
        <meta name="twitter:description" content="{{ $seo['description'] ?? '' }}">
        @if (! empty($seo['image']))
            <meta name="twitter:image" content="{{ $seo['image'] }}">
            <meta name="twitter:image:alt" content="{{ $seo['imageAlt'] ?? '' }}">
        @endif

        @if (! empty($seo['jsonLd']))
            <script type="application/ld+json">{!! json_encode($seo['jsonLd'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) !!}</script>
        @endif

        <meta name="theme-color" content="#0a0a0a">
        <link rel="icon" href="/favicon.svg" type="image/svg+xml">
        <link rel="alternate" type="text/plain" href="{{ url('/llms.txt') }}" title="llms.txt">

        <link rel="preconnect" href="https://fonts.bunny.net">
        <link href="https://fonts.bunny.net/css?family=instrument-sans:400,500,600" rel="stylesheet" />

        {{-- PokeHub card fonts (Gill Sans-like Cabin) + holo foil engine, served from public/ --}}
        <link rel="stylesheet" href="/fonts/cabin.css" />
        <link rel="stylesheet" href="/holo.css" />

        @routes
        @viteReactRefresh
        @vite(['resources/js/app.tsx', "resources/js/pages/{$page['component']}.tsx"])
        @inertiaHead
    </head>
    <body class="font-sans antialiased">
        @inertia
    </body>
</html>
