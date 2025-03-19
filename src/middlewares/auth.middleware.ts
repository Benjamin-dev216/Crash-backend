/** @format */
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import "dotenv/config";
import { authService } from "@/services";

export const authMiddleware = async(
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const token = req.header("Authorization")? req.header("Authorization").replace("Bearer ", ""): null;

  if (!token) {
    res.status(401).json({ error: "Authentication required!" });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await authService.getUser(decoded);

    if (!user) throw "User Not Found!";

    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};

