const { handleApi } = require("../../lib/backend");

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    await handleApi(req, res, url);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Serverfehler", detail: error.message });
  }
}
