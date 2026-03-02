let attachmentId = null;
let docToken = null;
let docBaseUrl = null;

grist.ready({
    columns: [
        { name: "MyImageColumn", title: "Select Image Column", type: "Attachments" }
    ],
    requiredAccess: 'full'
});

grist.docApi.getAccessToken({ readOnly: true }).then(result => {
    docToken = result.token;
    docBaseUrl = result.baseUrl;
});

grist.onRecord(function (record, mappings) {
    if (!mappings || !mappings.MyImageColumn) return;
    const files = record[mappings.MyImageColumn];
    const btn = document.getElementById('copyBtn');

    if (files && files.length > 0) {
        attachmentId = files[0];
        btn.disabled = false;
        btn.innerHTML = "📋 Copy Image";
    } else {
        attachmentId = null;
        btn.disabled = true;
        btn.innerHTML = "No Image Found";
    }
    document.getElementById('status').innerText = "";
});

// Function to convert Blob to PNG Blob using Canvas
async function convertToPng(blob) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);

        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            canvas.toBlob((pngBlob) => {
                URL.revokeObjectURL(url);
                if (pngBlob) resolve(pngBlob);
                else reject(new Error("Canvas conversion failed"));
            }, 'image/png');
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Image load failed"));
        };

        img.src = url;
    });
}

document.getElementById('copyBtn').onclick = async function () {
    if (!attachmentId || !docToken) {
        return;
    }
    const statusEl = document.getElementById('status');

    try {
        statusEl.innerText = "Downloading & Converting...";

        const url = `${docBaseUrl}/attachments/${attachmentId}/download?auth=${docToken}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error("Download failed");

        let blob = await response.blob();

        // If it is NOT a PNG (e.g. JPEG), convert it!
        if (blob.type !== 'image/png') {
            blob = await convertToPng(blob);
        }

        // Now we can safely write 'image/png' to clipboard
        const item = new ClipboardItem({ "image/png": blob });
        await navigator.clipboard.write([item]);

        statusEl.innerText = "✅ Copied!";
        setTimeout(() => statusEl.innerText = "", 2000);

    } catch (err) {
        console.error(err);
        statusEl.innerText = "❌ Error: " + err.message;
    }
};