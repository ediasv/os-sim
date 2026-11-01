import { describe, expect, it, vi } from 'vitest';
import { IMAGE_FILE_CHANNEL } from '../shared/imageFile';
import { createImageFileApi } from './imageFileApi';

describe('createImageFileApi', () => {
    it('invokes the image channel with the content only', async () => {
        const invoke = vi.fn().mockResolvedValue({ status: 'canceled' });

        await createImageFileApi(invoke).saveImageFile({ content: '<svg/>' });

        expect(invoke).toHaveBeenCalledExactlyOnceWith(IMAGE_FILE_CHANNEL, {
            content: '<svg/>',
        });
    });

    it('drops a path smuggled in by the renderer', async () => {
        const invoke = vi.fn().mockResolvedValue({ status: 'canceled' });
        const api = createImageFileApi(invoke);

        await api.saveImageFile({
            content: '<svg/>',
            path: '/etc/passwd',
        } as never);

        expect(invoke).toHaveBeenCalledExactlyOnceWith(IMAGE_FILE_CHANNEL, {
            content: '<svg/>',
        });
    });

    it('exposes only saveImageFile', () => {
        expect(Object.keys(createImageFileApi(vi.fn()))).toEqual([
            'saveImageFile',
        ]);
    });
});
