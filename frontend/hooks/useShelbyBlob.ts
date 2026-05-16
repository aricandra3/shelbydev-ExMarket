/// Hook: Read/write blobs via Shelby SDK

"use client";

import { useState, useCallback } from "react";
import { shelbyService } from "@/lib/shelby";
import { getErrorMessage } from "@/lib/utils";

export function useShelbyBlob() {
    const [uploading, setUploading] = useState(false);
    const [reading, setReading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const uploadToRpc = useCallback(async (content: string, address: string, blobName: string): Promise<string | null> => {
        setUploading(true);
        setError(null);

        try {
            await shelbyService.putBlobDirectly(content, address, blobName);
            return `${address}/${blobName}`;
        } catch (err: unknown) {
            setError(getErrorMessage(err, "Upload failed"));
            return null;
        } finally {
            setUploading(false);
        }
    }, []);

    const readBlob = useCallback(async (blobId: string): Promise<string | null> => {
        setReading(true);
        setError(null);

        try {
            const content = await shelbyService.readPrompt(blobId);
            return content;
        } catch (err: unknown) {
            setError(getErrorMessage(err, "Read failed"));
            return null;
        } finally {
            setReading(false);
        }
    }, []);

    return {
        uploadToRpc,
        readBlob,
        uploading,
        reading,
        error,
    };
}
