Ext.define('Rally.ui.combobox.CustomMilestoneComboBox', {
  extend: 'Rally.ui.combobox.ComboBox',
  alias: 'widget.rallycustommilestonecombobox',
  
  requires: [
    'Rally.util.DateTime',
    'Rally.data.wsapi.Filter',
    'Rally.util.Ref',
    'Rally.data.util.Sorter'
    ],

    mixins: [
        'Rally.ui.MilestoneListHeadings',
        'Rally.app.Scopeable'
    ],

    config: {
        allowNoEntry: false,
        hideLabel: true,
        storeConfig: {
            autoLoad: true,
            model: Ext.identityFn('milestone'),
            remoteFilter: true,
            remoteSort: false
        },
        listConfig: {
            minWidth: 385,
            cls: 'milestone-list',
            emptyText: 'No Milestones Defined',
            itemTpl: Ext.create('Ext.XTemplate',
                '<div class="milestone-name">{_refObjectName}</div>',
                '<div class="milestone-date">{[Rally.util.DateTime.formatWithDefault(values.TargetDate)]}</div>',
                '<div class="milestone-raw-date">{TargetDate}</div>'
            )
        },
        componentCls: 'rui-triggerfield rally-milestone-combobox'
    },

    constructor: function(config) {
        config = config || {};
        this.mergeConfig(config);

        this.config.storeConfig.filters = _.compact(_.union(
            [this._getProjectFilter()],
            [this._getValueFilter()],
            this.config.storeConfig.filters));

        this.callParent([this.config]);
    },

    initComponent: function () {
        this.storeConfig.sorters = [{
            sorterFn: Rally.data.util.Sorter.getDefaultSortFn('Milestone')
        }];
        var autoLoadStore = this.storeConfig && this.storeConfig.autoLoad;
        this.callParent(arguments);
        if (!autoLoadStore) {
            this.onReady();
        }
    },

    createPicker: function() {
        var picker = this.callParent(arguments);

        picker.on({
            itemadd: function(added, index, nodes, options) {
                this._addListHeaders(picker, options);
            },
            show: this._addListHeaders,
            refresh: this._addListHeaders,
            scope: this,
            filterSelectedNodes: false
        });

        return picker;
    },

    beforeQuery: function(queryPlan) {
        var queryString = queryPlan.query,
            filter = Ext.create('Rally.data.wsapi.Filter', {
                property: 'Name',
                operator: 'contains',
                value: queryString
            });

        this.store.filters = this.store.filters.filterBy(function(item) {
            return item.property !== 'Name' && item.property !== 'ObjectID';
        });

        if (queryString) {
            queryPlan.query = filter.toString();
            queryPlan.originalQuery = queryString;
        } else {
            queryPlan.query = '';
            queryPlan.originalQuery = '';
        }
        queryPlan.forceAll = true;

        return this.callParent(arguments);
    },

    _getValueFilter: function() {
        if(!this.value) {
            return null;
        }

        return Ext.create('Rally.data.wsapi.Filter', {
            property: 'ObjectID',
            value: Rally.util.Ref.getOidFromRef(this.value)
        });
    },

    _getProjectFilter: function() {
        return Rally.data.wsapi.Filter.or([
            {
                property: 'Projects',
                operator: 'contains',
                value: Rally.util.Ref.getRelativeUri(this.getProjectRef())
            }, {
                property: 'TargetProject',
                operator: '=',
                value: null
            }
        ]);
    },
    doLocalQuery: function(queryPlan) {
      var me = this,
          filteredData = [];
      
      for (var i = 0; i < me.originData.length; i++) {
        if (me.originData[i].data.Name.indexOf(queryPlan.originalQuery) !== -1) {
          filteredData.push(me.originData[i]);
        }
      }
      me.store.removeAll();
      me.store.loadData(filteredData);

      if (me.store.getCount()) {
          me.expand();
      } else {
          me.collapse();
      }

      me.afterQuery(queryPlan);
  },
  originData: undefined,

});

