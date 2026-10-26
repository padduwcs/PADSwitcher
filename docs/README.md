# Hướng dẫn PADSwitcher / Documentation

## Cài ứng dụng / Install the app

| Hệ điều hành / Platform | Hướng dẫn / Guide | Tải về / Download |
| --- | --- | --- |
| Windows — stable | [Việt](https://github.com/padduwcs/PADSwitcher/blob/main/docs/WINDOWS-INSTALL.md) · [English](https://github.com/padduwcs/PADSwitcher/blob/main/docs/WINDOWS-INSTALL.en.md) | [Windows](https://github.com/padduwcs/PADSwitcher/releases/latest) |
| Linux/macOS — preview | [Việt](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/UNIX-INSTALL.md) · [English](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/UNIX-INSTALL.en.md) | [Unix.7](https://github.com/padduwcs/PADSwitcher/releases/tag/unix-v1.19.1-unix.7) |

Người dùng bắt đầu bằng bộ cài. Người muốn sửa mã nguồn xem phần phát triển.
Start with an installer for everyday use; use the development guides for source changes.

## Dùng Codex và Kaggle / Use Codex and Kaggle

- [Codex Windows: Việt/English](https://github.com/padduwcs/PADSwitcher/blob/main/docs/CODEX.md)
- [Codex Unix, desktop và tự chuyển: Việt](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/UNIX-INSTALL.md#bật-tự-chuyển-tài-khoản-cho-desktop-và-extension) · [English](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/UNIX-INSTALL.en.md#enable-account-fallback-for-desktop-and-the-extension)
- [Kaggle Windows: Việt](https://github.com/padduwcs/PADSwitcher/blob/main/docs/KAGGLE.md) · [English](https://github.com/padduwcs/PADSwitcher/blob/main/docs/KAGGLE.en.md)
- [Kaggle Unix: Việt](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/KAGGLE.md) · [English](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/KAGGLE.en.md)
- [Hỗ trợ / Support](../SUPPORT.md) · [Bảo mật / Security](../SECURITY.md)

## Phát triển / Develop

| Mục đích / Purpose | Windows | Linux/macOS |
| --- | --- | --- |
| Chạy mã nguồn / Source setup | [Development](https://github.com/padduwcs/PADSwitcher/blob/main/docs/DEVELOPMENT.md) | [Development](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/DEVELOPMENT.md) |
| Kiểm thử và phát hành / Test and release | [Releasing](https://github.com/padduwcs/PADSwitcher/blob/main/docs/RELEASING.md) | [Releasing](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/RELEASING.md) |
| Lịch sử phiên bản / Changes | [Changelog](https://github.com/padduwcs/PADSwitcher/blob/main/CHANGELOG.md) | [Changelog](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/CHANGELOG.md) |

[Đóng góp / Contributing](../CONTRIBUTING.md). Một checkout là đủ: dùng `main`
cho Windows và `feature/cross-platform` cho Unix; chuyển nhánh không gộp hai bản.
One checkout can serve both branches. Switch only after saving your work and
preparing the selected branch's dependencies.

## Kiến trúc và kiểm chứng / Architecture and validation

- [Unix routing: Việt](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/architecture/ROUTING.md) · [English](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/architecture/ROUTING.en.md)
- [Unix validation](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/UNIX-VALIDATION.md)
- [Windows routing](https://github.com/padduwcs/PADSwitcher/blob/main/ROUTING.en.md) · [Windows validation](https://github.com/padduwcs/PADSwitcher/blob/main/VALIDATION.md)
- [Bảo trì repo / Repository maintenance](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/MAINTENANCE.md)
- [Báo cáo cũ / Historical records](https://github.com/padduwcs/PADSwitcher/blob/feature/cross-platform/docs/archive/README.md)

Tài liệu lưu trữ mô tả các lần kiểm chứng trước đây; dùng hướng dẫn cài đặt và
phát triển hiện tại để chạy ứng dụng. Archived reports describe past releases;
use the current installation/development guides for setup.
