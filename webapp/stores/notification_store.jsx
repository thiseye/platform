// Copyright (c) 2016 Mattermost, Inc. All Rights Reserved.
// See License.txt for license information.

import AppDispatcher from '../dispatcher/app_dispatcher.jsx';
import EventEmitter from 'events';
import Constants from 'utils/constants.jsx';
import UserStore from './user_store.jsx';
import ChannelStore from './channel_store.jsx';
import * as UserAgent from 'utils/user_agent.jsx';
import * as Utils from 'utils/utils.jsx';
import {buildGroupChannelName} from 'utils/channel_utils.jsx';
import * as PostUtils from 'utils/post_utils.jsx';
const ActionTypes = Constants.ActionTypes;

const CHANGE_EVENT = 'change';

class NotificationStoreClass extends EventEmitter {
    emitChange() {
        this.emit(CHANGE_EVENT);
    }

    addChangeListener(callback) {
        this.on(CHANGE_EVENT, callback);
    }

    removeChangeListener(callback) {
        this.removeListener(CHANGE_EVENT, callback);
    }
    setFocus(focus) {
        this.inFocus = focus;
    }

    handleReceivedPost(post, msgProps) {
        // Send desktop notification
        if ((UserStore.getCurrentId() !== post.user_id || post.props.from_webhook === 'true')) {
            if (PostUtils.isSystemMessage(post)) {
                return;
            }

            let mentions = [];
            if (msgProps.mentions) {
                mentions = JSON.parse(msgProps.mentions);
            }
            const teamId = msgProps.team_id;

            let channel = ChannelStore.get(post.channel_id);
            const user = UserStore.getCurrentUser();
            const member = ChannelStore.getMyMember(post.channel_id);

            let notifyLevel = member && member.notify_props ? member.notify_props.desktop : 'default';
            if (notifyLevel === 'default') {
                notifyLevel = user.notify_props.desktop;
            }

            if (notifyLevel === 'none') {
                return;
            } else if (notifyLevel === 'mention' && mentions.indexOf(user.id) === -1 && msgProps.channel_type !== Constants.DM_CHANNEL) {
                return;
            }

            let username = Utils.localizeMessage('channel_loader.someone', 'Someone');
            if (post.props.override_username && global.window.mm_config.EnablePostUsernameOverride === 'true') {
                username = post.props.override_username;
            } else if (msgProps.sender_name) {
                username = msgProps.sender_name;
            } else if (UserStore.hasProfile(post.user_id)) {
                username = UserStore.getProfile(post.user_id).username;
            }

            let title = Utils.localizeMessage('channel_loader.posted', 'Posted');
            if (!channel) {
                title = msgProps.channel_display_name;
                channel = {
                    name: msgProps.channel_name
                };
            } else if (channel.type === Constants.DM_CHANNEL) {
                title = Utils.localizeMessage('notification.dm', 'Direct Message');
            } else if (channel.type === Constants.GM_CHANNEL) {
                title = buildGroupChannelName(channel.id);
            } else {
                title = channel.display_name;
            }

            let notifyText = post.message.replace(/\n+/g, ' ');
            if (notifyText.length > 50) {
                notifyText = notifyText.substring(0, 49) + '...';
            }

            let body = '';
            if (notifyText.length === 0) {
                if (msgProps.image) {
                    body = username + Utils.localizeMessage('channel_loader.uploadedImage', ' uploaded an image');
                } else if (msgProps.otherFile) {
                    body = username + Utils.localizeMessage('channel_loader.uploadedFile', ' uploaded a file');
                } else {
                    body = username + Utils.localizeMessage('channel_loader.something', ' did something new');
                }
            } else {
                body = username + Utils.localizeMessage('channel_loader.wrote', ' wrote: ') + notifyText;
            }

            let duration = Constants.DEFAULT_NOTIFICATION_DURATION;
            if (user.notify_props && user.notify_props.desktop_duration) {
                duration = parseInt(user.notify_props.desktop_duration, 10) * 1000;
            }

            //Play a sound if explicitly set in settings
            const sound = !user.notify_props || user.notify_props.desktop_sound === 'true';

            // Notify if you're not looking in the right channel or when
            // the window itself is not active
            const activeChannel = ChannelStore.getCurrent();
            const channelId = channel ? channel.id : null;
            const notify = (activeChannel && activeChannel.id !== channelId) || !this.inFocus;

            if (notify) {
                Utils.notifyMe(title, body, channel, teamId, duration, !sound);

                //Don't add extra sounds on native desktop clients
                if (sound && !UserAgent.isWindowsApp() && !UserAgent.isMacApp() && !UserAgent.isMobileApp()) {
                    Utils.ding();
                }
            }
        }
    }
}

var NotificationStore = new NotificationStoreClass();

NotificationStore.dispatchToken = AppDispatcher.register((payload) => {
    const action = payload.action;

    switch (action.type) {
    case ActionTypes.RECEIVED_POST:
        NotificationStore.handleReceivedPost(action.post, action.websocketMessageProps);
        NotificationStore.emitChange();
        break;
    case ActionTypes.BROWSER_CHANGE_FOCUS:
        NotificationStore.setFocus(action.focus);
        break;
    }
});

export default NotificationStore;
