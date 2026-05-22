/*
 * Copyright (C) Online-Go.com
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { GobanInteractive, MoveCommand } from "./InteractiveBase";

/**
 * Sandbox stub of the OGS networking layer. Retains the inheritance slot
 * (Goban → OGSConnectivity → GobanInteractive) and the small public surface
 * that Goban/SVGRenderer call into, but performs no socket I/O.
 */
export abstract class OGSConnectivity extends GobanInteractive {
    public sent_timed_out_message: boolean = false;
    protected socket: any = undefined;

    public override destroy(): void {
        super.destroy();
    }

    public sendTimedOut(): void {
        this.sent_timed_out_message = true;
    }

    protected sendMove(_mv: MoveCommand, cb?: () => void): boolean {
        if (cb) {
            cb();
        }
        return true;
    }

    public syncReviewMove(_msg_override?: any, _node_text?: string): void {
        // no-op
    }

    public setState(): void {
        // no-op
    }
}
