# Firebase Auth Emulator Setup for Download Testing

## The Issue
Firebase Auth emulator doesn't use real Google OAuth. Instead, it provides its own authentication UI for testing.

## Correct Solution

### 1. Access the Auth Emulator UI
With emulators running, go to: **http://localhost:4000/auth**

### 2. Create Test Users
In the Auth emulator UI:
- Click "Add user" 
- Create a user with:
  - **Email**: `test@gmail.com` (or any @gmail.com email)
  - **Password**: `password123`
- The domain `gmail.com` is already allowed in the provisioning script

### 3. Sign In via Application
1. Go to your app at http://localhost:5173 (or wherever the UI is running)
2. Click "Sign in with Google" 
3. **The emulator will redirect to its own auth UI**, not real Google
4. Use the test credentials you created:
   - Email: `test@gmail.com`
   - Password: `password123`

### 4. Test Download Functionality
Once authenticated:
- Navigate to `/analysis`
- You should see download buttons on package cards
- Test the download functionality

## Why This Works
- The Auth emulator intercepts Google sign-in requests
- It shows its own sign-in form instead of redirecting to Google
- Test users created in the emulator UI can sign in
- Domain checking (`gmail.com`) is already allowed via provisioning
- Download functions will work with proper auth tokens

## Alternative: Use Real Firebase Project
If you want to use real Google sign-in:
1. Set up a real Firebase project
2. Configure OAuth properly
3. Use `pnpm ui:dev:cloud` instead of `pnpm ui:dev`
4. Update `.env.local` with real Firebase config

## Troubleshooting
- **"Authentication required"**: Make sure you're signed in via the emulator UI
- **"Domain not allowed"**: Check that your test email uses `@gmail.com` or `@castoredc.com`
- **Can't see emulator UI**: Ensure emulators are running (`pnpm emulator:start`)
- **Wrong sign-in page**: The emulator should show Firebase Auth UI, not Google's real OAuth page