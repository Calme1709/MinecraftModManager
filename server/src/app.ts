import express from "express";

import routes from "@routes";
import cors from "cors";
import { errorHandler } from "@middleware";

const app = express();

app.use(express.json());
app.use(cors());

app.use(routes);

app.use(errorHandler);

export default app;