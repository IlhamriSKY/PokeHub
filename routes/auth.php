<?php

use App\Http\Controllers\Auth\AuthenticatedSessionController;
use App\Http\Controllers\Auth\EmailVerificationNotificationController;
use App\Http\Controllers\Auth\EmailVerificationPromptController;
use App\Http\Controllers\Auth\GithubController;
use App\Http\Controllers\Auth\VerifyEmailController;
use Illuminate\Support\Facades\Route;

Route::middleware('guest')->group(function () {
    // No manual sign-up: accounts are created only by the GitHub callback.
    Route::get('login', [AuthenticatedSessionController::class, 'create'])
        ->name('login');

    // Throttled: the callback creates users, so it is an unauthenticated write path.
    Route::get('auth/github/redirect', [GithubController::class, 'redirect'])
        ->middleware('throttle:10,1')
        ->name('github.redirect');
    Route::get('auth/github/callback', [GithubController::class, 'callback'])
        ->middleware('throttle:10,1')
        ->name('github.callback');
});

Route::middleware('auth')->group(function () {
    Route::get('verify-email', EmailVerificationPromptController::class)
        ->name('verification.notice');

    Route::get('verify-email/{id}/{hash}', VerifyEmailController::class)
        ->middleware(['signed', 'throttle:6,1'])
        ->name('verification.verify');

    Route::post('email/verification-notification', [EmailVerificationNotificationController::class, 'store'])
        ->middleware('throttle:6,1')
        ->name('verification.send');

    Route::post('logout', [AuthenticatedSessionController::class, 'destroy'])
        ->name('logout');
});
