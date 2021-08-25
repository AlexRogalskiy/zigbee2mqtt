import equals from 'fast-deep-equal/es6';
import humanizeDuration from 'humanize-duration';
import data from './data';
import vm from 'vm';
import fs from 'fs';
import path from 'path';

// construct a local ISO8601 string (instead of UTC-based)
// Example:
//  - ISO8601 (UTC) = 2019-03-01T15:32:45.941+0000
//  - ISO8601 (local) = 2019-03-01T16:32:45.941+0100 (for timezone GMT+1)
function toLocalISOString(date: Date): string {
    const tzOffset = -date.getTimezoneOffset();
    const plusOrMinus = tzOffset >= 0 ? '+' : '-';
    const pad = (num: number): string => {
        const norm = Math.floor(Math.abs(num));
        return (norm < 10 ? '0' : '') + norm;
    };

    return date.getFullYear() +
        '-' + pad(date.getMonth() + 1) +
        '-' + pad(date.getDate()) +
        'T' + pad(date.getHours()) +
        ':' + pad(date.getMinutes()) +
        ':' + pad(date.getSeconds()) +
        plusOrMinus + pad(tzOffset / 60) +
        ':' + pad(tzOffset % 60);
}

export const endpointNames = [
    'left', 'right', 'center', 'bottom_left', 'bottom_right', 'default',
    'top_left', 'top_right', 'white', 'rgb', 'cct', 'system', 'top', 'bottom', 'center_left', 'center_right',
    'ep1', 'ep2', 'row_1', 'row_2', 'row_3', 'row_4', 'relay', 'usb',
    'l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8',
    'l9', 'l10', 'l11', 'l12', 'l13', 'l14', 'l15', 'l16',
    'button_1', 'button_2', 'button_3', 'button_4', 'button_5',
    'button_6', 'button_7', 'button_8', 'button_9', 'button_10',
    'button_11', 'button_12', 'button_13', 'button_14', 'button_15',
    'button_16', 'button_17', 'button_18', 'button_19', 'button_20',
    'button_light', 'button_fan_high', 'button_fan_med', 'button_fan_low',
    'heat', 'cool', 'water', 'meter', 'wifi',
];

export function capitalize(s: string): string {
    return s[0].toUpperCase() + s.slice(1);
}

export async function getZigbee2MQTTVersion(): Promise<{commitHash: string, version: string}> {
    const git = await import('git-last-commit');
    const packageJSON = await import('../..' + '/package.json');

    return new Promise((resolve) => {
        const version = packageJSON.version;

        git.getLastCommit((err: Error, commit: {shortHash: string}) => {
            let commitHash = null;

            if (err) {
                try {
                    commitHash = fs.readFileSync(path.join(__dirname, '..', '..', 'dist', '.hash'), 'utf-8');
                } catch (error) {
                    /* istanbul ignore next */
                    commitHash = 'unknown';
                }
            } else {
                commitHash = commit.shortHash;
            }

            resolve({commitHash, version});
        });
    });
}

export async function getDependencyVersion(depend: string): Promise<{version: string}> {
    const packageJSON = await import(path.join(__dirname, '..', '..', 'node_modules', depend, 'package.json'));
    const version = packageJSON.version;
    return {version};
}

export function formatDate(time: number, type: 'ISO_8601' | 'ISO_8601_local' | 'epoch' | 'relative'): string | number {
    if (type === 'ISO_8601') return new Date(time).toISOString();
    else if (type === 'ISO_8601_local') return toLocalISOString(new Date(time));
    else if (type === 'epoch') return time;
    else { // relative
        return humanizeDuration(Date.now() - time, {language: 'en', largest: 2, round: true}) + ' ago';
    }
}

export function objectHasProperties(object: {[s: string]: unknown}, properties: string[]): boolean {
    for (const property of properties) {
        if (!object.hasOwnProperty(property)) {
            return false;
        }
    }

    return true;
}

export function equalsPartial(object: {[s: string]: unknown}, expected: {[s: string]: unknown}): boolean {
    for (const [key, value] of Object.entries(expected)) {
        if (!equals(object[key], value)) {
            return false;
        }
    }

    return true;
}

export function getObjectProperty(object: {[s: string]: unknown}, key: string, defaultValue: unknown): unknown {
    return object && object.hasOwnProperty(key) ? object[key] : defaultValue;
}

export function getResponse(request: {transaction: string}, data: unknown, error: string):
    {data: unknown, status: string, error?: string, transaction?: string} {
    const response: {data: unknown, status: string, error?: string, transaction?: string} =
        {data, status: error ? 'error' : 'ok'};
    if (error) response.error = error;
    if (typeof request === 'object' && request.hasOwnProperty('transaction')) {
        response.transaction = request.transaction;
    }
    return response;
}

export function parseJSON(value: string, failedReturnValue: unknown): unknown {
    try {
        return JSON.parse(value);
    } catch (e) {
        return failedReturnValue;
    }
}

export function loadModuleFromText(moduleCode: string): unknown {
    const moduleFakePath = path.join(__dirname, 'externally-loaded.js');
    const sandbox = {
        require: require,
        module: {},
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        setImmediate,
        clearImmediate,
    };
    vm.runInNewContext(moduleCode, sandbox, moduleFakePath);
    /* eslint-disable-line */ // @ts-ignore
    return sandbox.module.exports;
}

export function loadModuleFromFile(modulePath: string): unknown {
    const moduleCode = fs.readFileSync(modulePath, {encoding: 'utf8'});
    return loadModuleFromText(moduleCode);
}

/* eslint-disable-next-line */
export function* getExternalConvertersDefinitions(settings: any): any {
    const externalConverters = settings.get().external_converters;

    for (const moduleName of externalConverters) {
        let converter;

        if (moduleName.endsWith('.js')) {
            converter = loadModuleFromFile(data.joinPath(moduleName));
        } else {
            converter = require(moduleName);
        }

        if (Array.isArray(converter)) {
            for (const item of converter) {
                yield item;
            }
        } else {
            yield converter;
        }
    }
}

export function removeNullPropertiesFromObject(obj: KeyValue): void {
    for (const key of Object.keys(obj)) {
        const value = obj[key];
        if (value == null) {
            delete obj[key];
        } else if (typeof value === 'object') {
            removeNullPropertiesFromObject(value);
        }
    }
}

export function getKey(
    object: KeyValue, value: unknown, fallback: unknown, convertTo: (v: unknown) => unknown): unknown {
    for (const key in object) {
        if (object[key]===value) {
            return convertTo ? convertTo(key) : key;
        }
    }

    return fallback;
}

export function toNetworkAddressHex(value: number): string {
    const hex = value.toString(16);
    return `0x${'0'.repeat(4 - hex.length)}${hex}`;
}

// eslint-disable-next-line
export function toSnakeCase(value: string | KeyValue): any {
    if (typeof value === 'object') {
        value = {...value};
        for (const key of Object.keys(value)) {
            const keySnakeCase = toSnakeCase(key);
            if (key !== keySnakeCase) {
                value[keySnakeCase] = value[key];
                delete value[key];
            }
        }
        return value;
    } else {
        return value.replace(/\.?([A-Z])/g, (x, y) => '_' + y.toLowerCase()).replace(/^_/, '').replace('_i_d', '_id');
    }
}

export function validateFriendlyName(name: string, throwFirstError=false): string[] {
    const errors = [];
    for (const endpointName of endpointNames) {
        if (name.toLowerCase().endsWith('/' + endpointName)) {
            errors.push(`friendly_name is not allowed to end with: '/${endpointName}'`);
        }
    }

    if (name.length === 0) errors.push(`friendly_name must be at least 1 char long`);
    if (name.endsWith('/') || name.startsWith('/')) errors.push(`friendly_name is not allowed to end or start with /`);
    if (name.endsWith(String.fromCharCode(0))) errors.push(`friendly_name is not allowed to contain null char`);
    if (endpointNames.includes(name)) errors.push(`Following friendly_name are not allowed: '${endpointNames}'`);
    if (name.match(/.*\/\d*$/)) errors.push(`Friendly name cannot end with a "/DIGIT" ('${name}')`);
    if (name.includes('#') || name.includes('+')) {
        errors.push(`MQTT wildcard (+ and #) not allowed in friendly_name ('${name}')`);
    }

    if (throwFirstError && errors.length) {
        throw new Error(errors[0]);
    }

    return errors;
}

export function sleep(seconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

export function sanitizeImageParameter(parameter: string): string {
    const replaceByDash = [/\?/g, /&/g, /[^a-z\d\- _./:]/gi];
    let sanitized = parameter;
    replaceByDash.forEach((r) => sanitized = sanitized.replace(r, '-'));
    return sanitized;
}

export function isAvailabilityNewEnabledForDevice(re: ResolvedEntity, settings: Settings): boolean {
    return re.settings.hasOwnProperty('availability') ? !!re.settings.availability : !!settings.availability;
}

export function isXiaomiDevice(device: Device): boolean {
    const xiaomiManufacturerID = [4151, 4447];
    return device.modelID !== 'lumi.router' && xiaomiManufacturerID.includes(device.manufacturerID) &&
        (!device.manufacturerName || !device.manufacturerName.startsWith('Trust'));
}

export function isIkeaTradfriDevice(device: Device): boolean {
    return [4476].includes(device.manufacturerID);
}

export const hours = (hours: number): number => 1000 * 60 * 60 * hours;
export const minutes = (minutes: number): number => 1000 * 60 * minutes;
export const seconds = (seconds: number): number => 1000 * seconds;