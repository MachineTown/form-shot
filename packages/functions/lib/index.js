"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.helloworld = void 0;
const https_1 = require("firebase-functions/v2/https");
const firebase_functions_1 = require("firebase-functions");
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
// Initialize Firebase Admin SDK
(0, app_1.initializeApp)();
exports.helloworld = (0, https_1.onRequest)({
    cors: true
}, async (request, response) => {
    const startTime = Date.now();
    try {
        // Log the request details
        firebase_functions_1.logger.info("Helloworld function called", {
            method: request.method,
            userAgent: request.get("User-Agent"),
            ip: request.ip,
            timestamp: new Date().toISOString()
        });
        // Check if user is authenticated
        const authHeader = request.get("Authorization");
        let userInfo = null;
        if (authHeader && authHeader.startsWith("Bearer ")) {
            try {
                const idToken = authHeader.split("Bearer ")[1];
                const decodedToken = await (0, auth_1.getAuth)().verifyIdToken(idToken);
                userInfo = {
                    uid: decodedToken.uid,
                    email: decodedToken.email,
                    emailVerified: decodedToken.email_verified
                };
                firebase_functions_1.logger.info("Authenticated user accessing helloworld", {
                    uid: userInfo.uid,
                    email: userInfo.email,
                    emailVerified: userInfo.emailVerified
                });
            }
            catch (authError) {
                firebase_functions_1.logger.warn("Invalid token provided", { error: authError });
            }
        }
        else {
            firebase_functions_1.logger.info("Unauthenticated request to helloworld");
        }
        // Prepare response data
        const responseData = {
            message: "Hello from Firebase Functions!",
            timestamp: new Date().toISOString(),
            user: userInfo,
            requestId: Math.random().toString(36).substring(7),
            processingTime: Date.now() - startTime
        };
        // Log successful response
        firebase_functions_1.logger.info("Helloworld function completed successfully", {
            processingTimeMs: responseData.processingTime,
            authenticated: !!userInfo,
            requestId: responseData.requestId
        });
        response.status(200).json(responseData);
    }
    catch (error) {
        // Log error
        firebase_functions_1.logger.error("Helloworld function failed", {
            error: error instanceof Error ? error.message : String(error),
            processingTimeMs: Date.now() - startTime,
            stack: error instanceof Error ? error.stack : undefined
        });
        response.status(500).json({
            error: "Internal server error",
            timestamp: new Date().toISOString(),
            requestId: Math.random().toString(36).substring(7)
        });
    }
});
//# sourceMappingURL=index.js.map