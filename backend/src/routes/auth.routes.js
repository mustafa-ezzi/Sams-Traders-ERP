import express from "express";
import { loginHandler } from "../controllers/auth.controller.js";

const router = express.Router();

router.post("/login", loginHandler);

export default router;

