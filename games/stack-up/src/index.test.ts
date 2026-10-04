import { describeConformance } from "@itg/game-sdk/conformance";
import factory, { SLUG } from "./index";

describeConformance(SLUG, factory);
