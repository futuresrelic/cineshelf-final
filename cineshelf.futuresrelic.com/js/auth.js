// CineShelf Authentication Helper
// Handles OAuth flow and session management

const Auth = (function() {

    const AUTH_API = '/api/auth.php';
    let currentUser = null;

    /**
     * Initialize auth system
     * Check if user is logged in, redirect if not
     */
    async function init() {
        try {
            const user = await verifySession();

            if (user) {
                currentUser = user;
                updateUI(user);
                return user;
            } else {
                // Not logged in, redirect to login page
                redirectToLogin();
            }
        } catch (error) {
            console.error('Auth init error:', error);
            redirectToLogin();
        }
    }

    /**
     * Verify current session
     */
    async function verifySession() {
        try {
            const response = await fetch(AUTH_API + '?action=verify');
            const result = await response.json();

            if (result.success && result.data) {
                return result.data;
            }

            return null;
        } catch (error) {
            console.error('Session verification failed:', error);
            return null;
        }
    }

    /**
     * Logout user
     */
    async function logout() {
        try {
            await fetch(AUTH_API + '?action=logout');
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            redirectToLogin();
        }
    }

    /**
     * Redirect to login page
     */
    function redirectToLogin() {
        if (!window.location.pathname.includes('login.html')) {
            window.location.href = '/login.html';
        }
    }

    /**
     * Update UI with user info
     */
    function updateUI(user) {
        // Update user badge
        const userBadge = document.getElementById('currentUser');
        if (userBadge) {
            userBadge.textContent = user.username || user.email;
        }

        // Add profile picture if available
        if (user.profile_picture) {
            const headerRight = document.querySelector('.header-right');
            if (headerRight) {
                // Check if profile picture already exists
                let img = headerRight.querySelector('img[alt="Profile"]');
                if (!img) {
                    // Create new profile picture
                    img = document.createElement('img');
                    img.alt = 'Profile';
                    img.style.cssText = 'width: 32px; height: 32px; border-radius: 50%; margin-right: 8px;';
                    headerRight.insertBefore(img, headerRight.firstChild);
                }
                // Update src (whether new or existing)
                img.src = user.profile_picture;
            }
        }

        // Show admin features if admin
        if (user.is_admin) {
            document.querySelectorAll('.admin-only').forEach(el => {
                el.style.display = '';
            });
        }

        // Add logout button functionality
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', logout);
        }
    }

    /**
     * Get current user
     */
    function getCurrentUser() {
        return currentUser;
    }

    /**
     * Get auth token for API calls
     */
    function getAuthToken() {
        // Token is in cookie, browser sends automatically
        return null; // API will read from cookie
    }

    /**
     * Check if user is admin
     */
    function isAdmin() {
        return currentUser && currentUser.is_admin;
    }

    return {
        init,
        logout,
        getCurrentUser,
        getAuthToken,
        isAdmin,
        verifySession
    };
})();

// Auto-initialize auth on page load (except login page)
if (!window.location.pathname.includes('login.html')) {
    // If DOM already loaded, init immediately
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            Auth.init();
        });
    } else {
        // DOM already loaded (script loaded dynamically)
        Auth.init();
    }
}