import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

// Initialize Firebase Admin SDK
initializeApp();

export const helloworld = onRequest({
  cors: true
}, async (request, response) => {
  const startTime = Date.now();
  
  try {
    // Log the request details
    logger.info("Helloworld function called", {
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
        const decodedToken = await getAuth().verifyIdToken(idToken);
        userInfo = {
          uid: decodedToken.uid,
          email: decodedToken.email,
          emailVerified: decodedToken.email_verified
        };
        
        logger.info("Authenticated user accessing helloworld", {
          uid: userInfo.uid,
          email: userInfo.email,
          emailVerified: userInfo.emailVerified
        });
      } catch (authError) {
        logger.warn("Invalid token provided", { error: authError });
      }
    } else {
      logger.info("Unauthenticated request to helloworld");
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
    logger.info("Helloworld function completed successfully", {
      processingTimeMs: responseData.processingTime,
      authenticated: !!userInfo,
      requestId: responseData.requestId
    });

    response.status(200).json(responseData);

  } catch (error) {
    // Log error
    logger.error("Helloworld function failed", {
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