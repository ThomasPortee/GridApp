Ext.define('Rally.technicalservices.HierarchyLoader', {
    logger: new Rally.technicalservices.Logger(),

    storyModelName: 'hierarchicalrequirement',
    taskModelName: 'task',

    mixins: {
        observable: 'Ext.util.Observable'
    },

    model: undefined,
    filters: undefined,
    fetch: undefined,
    childModels: undefined,
    sorters: undefined,

    maxParallelCalls: 6,

    constructor: function(config) {
        this.mixins.observable.constructor.call(this, config);
        this.portfolioItemTypes = config.portfolioItemTypes || [];
        this.model = config.model || null;
        this.fetch = config.fetch || [];
        this.filters = config.filters || [];
        this.loadChildModels = config.loadChildModels || [];
        this.sorters = config.sorters || [];
    },
    load: function() {

        if (!this.model) {
            this.fireEvent('hierarchyloaderror', "No model specified.");
            return;
        }
        if (this.portfolioItemTypes.length === 0) {
            this.fireEvent('hierarchyloaderror', "Portfolio Item Types not initialized.");
            return;
        }
        if (!(this.loadChildModels instanceof Array)) {
            this.fireEvent('hierarchyloaderror', "No child models specified.");
            return;
        }

        var fns = [];
        for (var i = 0; i < this.loadChildModels.length + 4; i++) {
            fns.push(this.fetchNextLevel);
        }

        Deft.Chain.pipeline(fns, this).then({
            success: function() {
                this.fireEvent('hierarchyloadcomplete');
            },
            failure: function(msg) {
                this.fireEvent('hierarchyloaderror', msg);
            },
            scope: this
        });
    },
    fetchNextLevel: function(args) {
        this.logger.log('fetchNextLevel', args, args && args.length);

        if (!args) {
            return this.fetchRoot();
        }

        args = _.flatten(args);
        this.logger.log('fetchNextLevel flattened args', args, args.length);

        if (args.length > 0 && Ext.isFunction(args[0].get)) {
            var type = args[0].get('_type');
            var types = Ext.Array.unique(Ext.Array.map(args, function(arg) { return arg.get('_type'); }));

            this.fireEvent('hierarchyloadartifactsloaded', type, args);

            var portfolioItemTypePaths = _.map(this.portfolioItemTypes, function(type) {
                    return type.get('TypePath').toLowerCase();
                }),
                portfolioItemOrdinal = _.indexOf(portfolioItemTypePaths, type);

            if (portfolioItemOrdinal === 0 && Ext.Array.contains(this.loadChildModels, this.storyModelName)) {
                return this.fetchUserStories(args);
            }
            if (portfolioItemOrdinal > 0 && Ext.Array.contains(this.loadChildModels, portfolioItemTypePaths[portfolioItemOrdinal - 1])) {
                return this.fetchPortfolioItems(portfolioItemTypePaths[portfolioItemOrdinal - 1], args);
            }

            return this.fetchChildrenFromMultipleTypes(types, args);
            // if (type === this.storyModelName ) {
            // this.getAllowedChildTypes(type);
            // return this.fetchTasks(args);
            //}
        }
        return [];
    },

    fetchRoot: function() {
        var fetch = this.fetch.concat(this.getRequiredFetchFields(this.model));
        this.fireEvent('statusupdate', "Loading artifacts");
        var config = {
            model: this.model,
            fetch: fetch,
            filters: this.filters,
            sorters: this.sorters,
            context: this.context
        };
        this.logger.log('fetchRoot config', config);

        return this.fetchWsapiRecords(config);
    },
    fetchPortfolioItems: function(type, parentRecords) {

        var fetch = this.fetch.concat(this.getRequiredFetchFields(type)),
            chunks = this._getChunks(parentRecords, 'Children', 'Count');

        return this.fetchChunks(type, fetch, chunks, "Parent.ObjectID", Ext.String.format("Please Wait... Loading Children for {0} Portfolio Items", parentRecords.length));
    },
    _getChunks: function(parentRecords, countField, countFieldAttribute) {
        this.logger.log("_getChunks", parentRecords, countField, countFieldAttribute);

        var chunks = [],
            childCount = 0,
            maxListSize = 100,
            childCountTarget = 200,
            idx = 0;

        chunks[idx] = [];
        _.each(parentRecords, function(r) {
            var count = r.get(countField);
            if (countFieldAttribute && count) {
                count = count[countFieldAttribute];
            }
            if (count > 0) { //using story count because it is a more accurate gauge of the number of user stories for a feature than UserStories.Count is, evne though it may not match exactly.
                childCount += count;
                if (childCount > childCountTarget || chunks[idx].length >= maxListSize) {
                    idx++;
                    chunks[idx] = [];
                    childCount = 0;
                }
                chunks[idx].push(r.get('ObjectID'));
            }
        });

        return chunks;
    },
    fetchUserStories: function(parentRecords) {
        var type = this.storyModelName,
            fetch = this.fetch.concat(this.getRequiredFetchFields(type)),
            chunks = this._getChunks(parentRecords, 'LeafStoryCount'),
            featureParentName = this.portfolioItemTypes[0].get('Name').replace(/\s/g, '') + ".ObjectID";

        return this.fetchChunks(type, fetch, chunks, featureParentName, Ext.String.format("Please Wait... Loading User Stories for {0} Portfolio Items", parentRecords.length));
    },

    fetchChildrenFromMultipleTypes: function(types, parentRecords) {
        this.logger.log('fetchChildrenFromMultipleTypes', types, parentRecords);

        var promises = [];
        Ext.Array.map(types, function(type) {
            child_types = this.getAllowedChildTypes(type);
            if (child_types.length > 0) {
                var parents = Ext.Array.filter(parentRecords, function(parent) {
                    return (parent.get('_type') == type);
                }, this);
                promises.push(function() {
                    return this.fetchChildrenOfMultipleTypes(parents);
                });
            }
        }, this);

        if (promises.length === 0) { return []; }
        return Deft.Chain.sequence(promises, this);
    },
    fetchChildrenOfMultipleTypes: function(parentRecords) {
        var parent_type = parentRecords[0].get('_type');
        var child_types = this.getAllowedChildTypes(parent_type);
        this.logger.log('fetchChildrenOfMultipleTypes', child_types, parentRecords);
        var promises = Ext.Array.map(child_types, function(type) {
            return function() { return this.fetchChildren(type, parentRecords); }
        }, this);

        return Deft.Chain.sequence(promises, this);
    },

    fetchChildren: function(type, parentRecords) {
        this.logger.log("fetchChildren", type, parentRecords);
        var fetch = this.fetch.concat(this.getRequiredFetchFields(type)),
            parentType = parentRecords[0].get('_type'),
            childField = this.getChildFieldFor(parentType, type),
            chunks = this._getChunks(parentRecords, childField, 'Count'),
            parentField = this.getParentFieldFor(type, parentType);

        return this.fetchChunks(type, fetch, chunks, parentField + ".ObjectID",
            Ext.String.format("Please Wait... Loading {0} for {1} items", childField, parentRecords.length));
    },

    // fetchTasks: function(parentRecords){
    //     var type = this.taskModelName,
    //         fetch = this.fetch.concat(this.getRequiredFetchFields(type)),
    //         chunks = this._getChunks(parentRecords, 'Tasks', 'Count');
    //
    //     return this.fetchChunks(type, fetch, chunks, "WorkProduct.ObjectID", Ext.String.format("Please Wait... Loading Tasks for {0} User Stories", parentRecords.length));
    // },
    fetchChunks: function(type, fetch, chunks, chunkProperty, statusString) {
        this.logger.log('fetchChunks', fetch, chunkProperty, chunks);

        if (!chunks || chunks.length === 0) {
            return [];
        }
        if (chunks[0].length === 0) {
            return [];
        }

        this.fireEvent('statusupdate', statusString);

        var promises = [];
        _.each(chunks, function(c) {
            var filters = _.map(c, function(ids) { return { property: chunkProperty, value: ids }; }),
                config = {
                    model: type,
                    fetch: fetch,
                    sorters: [
                        { property: 'TaskIndex', direction: 'ASC' },
                        { property: 'DragAndDropRank', direction: 'ASC' }
                    ],
                    filters: Rally.data.wsapi.Filter.or(filters),
                    context: { project: null }
                };
            promises.push(function() { return this.fetchWsapiRecords(config); });
        });

        return this.throttle(promises, this.maxParallelCalls, this);
    },
    _beforeLoadStore: function(store, operation, eOpts) {
        var projectRef = store.projectRef;
        var treeMilestones = undefined;
        var _fetchPrimaryMilestoneInfo = function(milestones, startIndex, pageSize){
            
            var url = "https://rally1.rallydev.com/slm/webservice/v2.0/milestone?&start=" + startIndex + "&project=" + projectRef + "&pagesize=" + pageSize + "&fetch=FormattedID,c_PrimaryMilestone"
            var response = Ext.Ajax.request({
                async: false,
                url: url,
                method: "GET",
            });
            if (response.status == 200){
                var responseTextObj = Ext.JSON.decode(response.responseText);
                milestones = milestones.concat(responseTextObj.QueryResult.Results);
                if (responseTextObj.QueryResult.TotalResultCount > startIndex + pageSize)
                {
                    return _fetchPrimaryMilestoneInfo(milestones, startIndex + pageSize, pageSize);
                }else{
                    return milestones;
                }
            }
        }
        var _fetchMilestonesByFormattedID = function(milestones, startIndex, pageSize, filters){
            var query = filters == undefined ? '' : filters.toString();
            var url = "https://rally1.rallydev.com/slm/webservice/v2.0/milestone?&start=" + startIndex + "&project=" + projectRef +  "&pagesize=" + pageSize + "&fetch=FormattedID&query="+ query
            var response = Ext.Ajax.request({
                async: false,
                url: url,
                method: "GET",
            });
            if (response.status == 200){
                var responseTextObj = Ext.JSON.decode(response.responseText);
                milestones = milestones.concat(responseTextObj.QueryResult.Results);
                if (responseTextObj.QueryResult.TotalResultCount > startIndex + pageSize)
                {
                    return _fetchPrimaryMilestoneInfo(milestones, startIndex + pageSize, pageSize);
                }else{
                    return milestones;
                }
            }
        }
        var _fetchPrimaryMilestoneInfo_alt = function(milestones, startIndex, pageSize){
            filters = Ext.create('Rally.data.wsapi.Filter', {
                property: 'c_PrimaryMilestone',
                operator: '!contains',
                value: 'NULL'
            });

            var url = "https://rally1.rallydev.com/slm/webservice/v2.0/milestone?&start=" + startIndex + "&project=" + projectRef + "&pagesize=" + pageSize + "&fetch=FormattedID,c_PrimaryMilestone&query=" + filters.toString();
            var response = Ext.Ajax.request({
                async: false,
                url: url,
                method: "GET",
            });
            if (response.status == 200){
                var responseTextObj = Ext.JSON.decode(response.responseText);
                milestones = milestones.concat(responseTextObj.QueryResult.Results);
                if (responseTextObj.QueryResult.TotalResultCount > startIndex + pageSize)
                {
                    return _fetchPrimaryMilestoneInfo(milestones, startIndex + pageSize, pageSize);
                }else{
                    return milestones;
                }
            }
        }
        var _processMilestonesHasPrimary = function(milestones){
            var hasPrimary = [];
            var primaryMilestones = [];
            for (var index = 0; index < milestones.length; index++) {
                var record = milestones[index];
                if (record.c_PrimaryMilestone.Count > 0)
                {
                    for (var jIndex = 0; jIndex<record.c_PrimaryMilestone.Count; jIndex ++ ){
                        var correctedRef = '/milestone/' + record._refObjectUUID;
                        var pMilestoneFormattedID = record.c_PrimaryMilestone._tagsNameArray[jIndex].Name.split(":")[0].trim();
                        hasPrimary.push({ 
                            'milestone' : correctedRef,
                            'milestoneFormattedID': record.FormattedID,
                            'pMilestoneFormattedID' : pMilestoneFormattedID,
                            'name' : record._refObjectName
                        });
                        if (!primaryMilestones[pMilestoneFormattedID]){
                            primaryMilestones[pMilestoneFormattedID] = {
                                'included' : record.FormattedID == pMilestoneFormattedID,
                                'milestone' : correctedRef,
                                'milestoneFormattedID': record.FormattedID,
                                'name' : record._refObjectName
                            }
                        }else{
                            if (record.FormattedID == pMilestoneFormattedID){
                                primaryMilestones[pMilestoneFormattedID]['included'] = true;
                            }
                        }
                    }
                }
            }

            //addded for ommited : primary milestone 
            for (var item in primaryMilestones){
                if (primaryMilestones[item].included == false){
                    for (var index = 0; index < milestones.length; index++) {
                        var record = milestones[index];
                        if (record.FormattedID == item){
                            var correctedRef = '/milestone/' + record._refObjectUUID;
                            hasPrimary.push({ 
                                'milestone' : correctedRef,
                                'milestoneFormattedID': record.FormattedID,
                                'pMilestoneFormattedID' : record.FormattedID,
                                'name' : record.Name
                            });
                        }
                    }
                }
            }
            return hasPrimary;
        }
        var _processMilestonesHasPrimary_alt = function(milestones){
            var hasPrimary = [];
            var primaryMilestones = [];
            for (var index = 0; index < milestones.length; index++) {
                var record = milestones[index];
                if (record.c_PrimaryMilestone.Count > 0)
                {
                    for (var jIndex = 0; jIndex<record.c_PrimaryMilestone.Count; jIndex ++ ){
                        var correctedRef = '/milestone/' + record._refObjectUUID;
                        var pMilestoneFormattedID = record.c_PrimaryMilestone._tagsNameArray[jIndex].Name.split(":")[0].trim();
                        hasPrimary.push({ 
                            'milestone' : correctedRef,
                            'milestoneFormattedID': record.FormattedID,
                            'pMilestoneFormattedID' : pMilestoneFormattedID,
                            'name' : record._refObjectName
                        });
                        if (!primaryMilestones[pMilestoneFormattedID]){
                            primaryMilestones[pMilestoneFormattedID] = {
                                'included' : record.FormattedID == pMilestoneFormattedID,
                                'milestone' : correctedRef,
                                'milestoneFormattedID': record.FormattedID,
                                'name' : record._refObjectName
                            }
                        }else{
                            if (record.FormattedID == pMilestoneFormattedID){
                                primaryMilestones[pMilestoneFormattedID]['included'] = true;
                            }
                        }
                    }
                }
            }

            var primaryMilestonesNotIncluded = [];
            filterForObjIDs = undefined
            //addded for ommited : primary milestone 
            for (var item in primaryMilestones){
                if (primaryMilestones[item].included == false){

                    if (filterForObjIDs == undefined){
                        filterForObjIDs = Ext.create('Rally.data.wsapi.Filter', {
                            property: 'FormattedID',
                            operator: '=',
                            value: item
                        });
                    }else{
                        filterForObjIDs = filterForObjIDs.or(Ext.create('Rally.data.wsapi.Filter', {
                            property: 'FormattedID',
                            operator: '=',
                            value: item
                        }));
                    }
                    primaryMilestonesNotIncluded.push(item);
                }
            }
            var fetchedMilestones = _fetchMilestonesByFormattedID([], 0, 2000, filterForObjIDs.toString());
            for (var index = 0; index < fetchedMilestones.length; index++) {
                var record = fetchedMilestones[index];
                var correctedRef = '/milestone/' + record._refObjectUUID;
                hasPrimary.push({ 
                    'milestone' : correctedRef,
                    'milestoneFormattedID': record.FormattedID,
                    'pMilestoneFormattedID' : record.FormattedID,
                    'name' : record.Name
                });
            }
            return hasPrimary;
        }
        var  _generateTreeStructure = function(milestones) {
            var tree = [];
            var map = {};
            // First pass: create a map of all milestones by their ID
            for (var i = 0; i < milestones.length; i++) {
              var milestone = milestones[i];              
              map[milestone.milestoneFormattedID] = { 
                'milestone': milestone.milestone, 
                'milestoneFormattedID': milestone.milestoneFormattedID, 
                'pMilestoneFormattedID': milestone.pMilestoneFormattedID,
                'name': milestone.name,
                'children': [] 
              };
            }
            // Second pass: assign children to their parents
            for (var i = 0; i < milestones.length; i++) {
                var milestone = milestones[i];
                if (milestone.pMilestoneFormattedID !== milestone.milestoneFormattedID) {
                    if (map[milestone.pMilestoneFormattedID] == undefined) {
                        // The parent milestone is not in the list, so this is a top-level milestone
                        tree.push(map[milestone.milestoneFormattedID]);  
                    } else {
                        map[milestone.pMilestoneFormattedID].children.push(map[milestone.milestoneFormattedID]);
                    }
              } else {
                // This is a root milestone
                tree.push(map[milestone.milestoneFormattedID]);
              }
            }
            return tree;
        }
        var getFormattedIDByRef = function(_ref){
            for (var index = 0; index < Rally.technicalservices.CustomGridWithDeepExportSettings.primaryMilestones.length; index++) {
                var element = Rally.technicalservices.CustomGridWithDeepExportSettings.primaryMilestones[index];
                if (_ref == element.data._uuidRef){
                    return element.data.FormattedID
                }
            }
            return null;
        }
        var _buildMilestoneTree = function(){
            // var milestones = _fetchPrimaryMilestoneInfo([], 1, 2000);
            var milestones_alt = _fetchPrimaryMilestoneInfo_alt([], 1, 2000);
            // var milestonesHasPrimary = _processMilestonesHasPrimary(milestones);
            var milestonesHasPrimary_alt = _processMilestonesHasPrimary_alt(milestones_alt);
            // console.log('_buildMilestoneTree 0: ', milestonesHasPrimary);
            // console.log('milestones: ', milestones);
            // console.log('milestonesHasPrimary: ', milestonesHasPrimary);
            return _generateTreeStructure(milestonesHasPrimary_alt);
        }
        var _fetchMilestoneTreeByFormattedID =  function(tree, id) {
            for (var i = 0; i < tree.length; i++) {
              if (tree[i].milestoneFormattedID === id) {
                return tree[i];
              } else if (tree[i].children.length > 0) {
                var result = _fetchMilestoneTreeByFormattedID(tree[i].children, id);
                if (result) {
                  return result;
                }
              }
            }
            return null;
          }
        var _traverseTree = function(tree, milestones) {
            if (tree == null) return [];
            milestones.push(tree.milestone);
            if (tree.children.length > 0) {
                for (var i = 0; i< tree.children.length; i++)
                {
                _traverseTree(tree.children[i], milestones);
                }
            }
            return milestones;
        }
        var _loadProjectsByMilestone =  function(milestone, subQuery){
            var artifacts = milestone.Artifacts;
            if (subQuery != undefined)
                var urlForArtifacts = artifacts._ref + "?start=1&pagesize=" + artifacts.Count + "&project=" + projectRef + '&fetch=Project&query='+ encodeURI(subQuery);
            else 
                var urlForArtifacts = artifacts._ref + "?start=1&pagesize=" + artifacts.Count + "&project=" + projectRef + '&fetch=Project'
            var response = Ext.Ajax.request({
                async: false,
                url: urlForArtifacts,
                method: "GET",
            });
            if (response.status == 200){
                var responseTextObj = Ext.JSON.decode(response.responseText);
                var responseProjects = responseTextObj.QueryResult.Results;
                var queryForMilestone = "";
                for (var index = 0; index < responseProjects.length; index++) {
                    //// Project = "/project/1cfd4cf4-5bf7-476c-8c3d-f6a6b906a3b7"
                    const projectUUID = responseProjects[index].Project._refObjectUUID;
                    if (index == 0)
                    {
                        queryForMilestone = '(Project = "/project/'+projectUUID+'")';
                    }else{
                        queryForMilestone = '('+ queryForMilestone + '(Project = "/project/'+projectUUID+'"))';
                    }
                    
                    if (index < responseProjects.length -1){
                        queryForMilestone += " OR ";
                    }
                }
                return queryForMilestone;
            }else{
                return ""
            }
        };

        var _generateQueryForMilestones_alt =  function(milestones, subQuery, portfolioItemTypesQuery_alt){
            var filters = undefined;
            for (var index = 0; index < milestones.length; index++) {
                var record = milestones[index];
                if (filters == undefined){
                    filters = Ext.create('Rally.data.wsapi.Filter', {
                        property: 'Milestones',
                        operator: '=',
                        value: record
                    });
                }else{
                    filters = filters.or(Ext.create('Rally.data.wsapi.Filter', {
                        property: 'Milestones',
                        operator: '=',
                        value: record
                    }));
                }
            }
            var url = 'https://rally1.rallydev.com/slm/webservice/v2.0/artifact';
            var query = '';
            if (subQuery != '' && subQuery != undefined && filters != undefined)
                query = '(' + subQuery +' AND ' + filters.toString() + ')';
            else if ((subQuery == '' || subQuery == undefined) && filters != undefined) 
                query = filters.toString();
            else if (subQuery != '' && subQuery != undefined && filters == undefined) 
                query = subQuery
            else 
                query = '';

            var response = Ext.Ajax.request({
                async: false,
                url: url,
                params:{
                    query: query,
                    pagesize: 2000,
                    project: projectRef,
                    types: portfolioItemTypesQuery_alt,
                    start: 1,
                    fetch: 'Project'
                }
            });
            if (response.status == 200){
                var responseTextObj = Ext.JSON.decode(response.responseText);
                var responseProjects = responseTextObj.QueryResult.Results;
                var queryForMilestone = "";
                for (var index = 0; index < responseProjects.length; index++) {
                    //// Project = "/project/1cfd4cf4-5bf7-476c-8c3d-f6a6b906a3b7"
                    const projectUUID = responseProjects[index].Project._refObjectUUID;
                    if (index == 0)
                    {
                        queryForMilestone = '(Project = "/project/'+projectUUID+'")';
                    }else{
                        queryForMilestone = '('+ queryForMilestone + '(Project = "/project/'+projectUUID+'"))';
                    }
                    
                    if (index < responseProjects.length -1){
                        queryForMilestone += " OR ";
                    }
                }
                return queryForMilestone;
            }else{
                return ""
            }
        };

        var _generateQueryForMilestones = function(urlSurfixForMilestone, subQuery){
            var response = Ext.Ajax.request({
                async: false,
                url: 'https://rally1.rallydev.com/slm/webservice/v2.0/' + urlSurfixForMilestone,
                method: "GET",
            });
            
            if (response.status == 200){
                var responseTextObj = Ext.JSON.decode(response.responseText);
                return _loadProjectsByMilestone(responseTextObj.Milestone, subQuery);
            }
            return "";
        }

        var _buildFiltersCollection = function(filterObj, collection) {
    
            if (filterObj.operator === 'AND') {
                collection.push ({
                    property: filterObj.value.property,
                    operator: filterObj.value.operator,
                    value: filterObj.value.value
                });
                return _buildFiltersCollection(filterObj.property, collection);
            }else{
                collection.push ({
                    property: filterObj.property,
                    operator: filterObj.operator,
                    value: filterObj.value
                });
                return collection;
            }
        }
        var _generateSubQuery = function(stateQuery, portfolioItemTypeQuery){
            var subQuery = '';
            if (stateQuery != undefined & portfolioItemTypeQuery != undefined)
            {
                subQuery = '(' + stateQuery + ' AND ' + portfolioItemTypeQuery + ')';
            }else if( stateQuery != undefined){
                subQuery = stateQuery;
            }else if ( portfolioItemTypeQuery != undefined){
                subQuery = portfolioItemTypeQuery;
            }
            return subQuery;
        }
        // var _beforeLoadStoreFn = function(){
        var typesForPortfolioItemType = 'portfolioitem/epic, portfolioitem/feature';
        var pageSize = Ext.clone(store.lastOptions.params.pagesize);
        
        if (operation.filters.length>0)
        {
            var filtersCollection = _buildFiltersCollection(operation.filters[0], []);
            var queryFilters = undefined;
            var milestoneFilterValue = undefined;
            var milestoneQuery = undefined;
            var stateQuery = undefined;
            var portfolioItemTypeQuery = undefined;
            var portfolioItemTypesQuery_alt = 'portfolioitem/epic, portfolioitem/feature';
            var milestonesToAdd = undefined;
            
            for (var index = 0; index < filtersCollection.length; index++) {
                const filter = filtersCollection[index];
                
                var query = "";
                if (filter.property == "Milestones"){
                    if (filter.operator.indexOf('?')== 0){
                        query = '(' + filter.property + ' ' + filter.operator.substring(1)+ ' "' + filter.value + '")';
                    }
                    else
                    { milestoneFilterValue = filter.value; continue;}
                }
                else{
                    //this case can be considered as "State" : multiple selections
                    if (filter.operator == 'OR' || filter.operator == 'AND'){
                        query = '(' + filter.property + ' ' + filter.operator+ ' ' + filter.value + ' )';
                        stateQuery = query;
                    }
                    else{
                        // this case is for checkbox filter
                        if (filter.property == 'IsPrimaryMilestone'){
                            if (filter.value == false){
                                continue;
                            }else{
                            }
                            continue;
                        }
                        if (filter.property == 'PrimaryMilestone'){
                            if (treeMilestones == undefined)
                                treeMilestones = _buildMilestoneTree();
                            var formattedID = getFormattedIDByRef(filter.value);
                            var milestonesToAdd = _traverseTree(_fetchMilestoneTreeByFormattedID(treeMilestones, formattedID), [], false)
                            if (milestonesToAdd == undefined || milestonesToAdd.length == 0)
                                milestonesToAdd.push(filter.value);
                            continue;
                        }

                        query = '(' + filter.property + ' ' + filter.operator+ ' "' + filter.value + '")';
                        if (filter.property == 'State')
                            stateQuery = query;
                        else if (filter.property == 'PortfolioItemType.Name'){
                            portfolioItemTypeQuery = query;
                            if (filter.value == 'Epic'){
                                portfolioItemTypesQuery_alt = 'portfolioitem/epic';
                            } else if (filter.value == 'Feature'){
                                portfolioItemTypesQuery_alt = 'portfolioitem/feature';
                            } else if (filter.value == undefined){
                                portfolioItemTypesQuery_alt = 'portfolioitem/epic,portfolioitem/feature'
                            }
                        }
                        if (filter.value == 'Epic')
                        {
                            typesForPortfolioItemType = "portfolioitem/epic";
                        }else if(filter.value == 'Feature'){
                            typesForPortfolioItemType = "portfolioitem/feature";
                        }
                    }
                }
                if (query == "") continue;

                if (queryFilters == undefined)
                {
                    queryFilters = query
                }else{
                    if (query != "")
                        queryFilters = '('+ queryFilters + query + ')';
                }
                if (index < filtersCollection.length -1 ){
                    queryFilters += " AND ";
                }
            }
            
            if (milestoneFilterValue != undefined){
                var subQuery = _generateSubQuery(stateQuery, portfolioItemTypeQuery);
                milestoneQuery = _generateQueryForMilestones(milestoneFilterValue, subQuery);
                if (milestoneQuery != '')
                {
                    if (queryFilters == '' || queryFilters == undefined)
                    {
                        queryFilters = milestoneQuery;
                    }
                    else {
                        queryFilters = '(' + queryFilters + (queryFilters.slice(-1) == ')' ? ' AND ' : '') + milestoneQuery + ')';
                    }
                }
                else
                {
                    // queryFilters = queryFilters.slice(0, queryFilters.length - 4);  // remove 'AND'
                    queryFilters = ' ( FormattedID = 0 ) ';
                }
                
            }else if (milestonesToAdd != undefined){
                var queryFilterArray = [];
                var milestoneQuery = undefined;
                milestoneQuery = _generateQueryForMilestones_alt(milestonesToAdd, stateQuery, portfolioItemTypesQuery_alt);
                console.log('milestonesToAdd', milestonesToAdd);
                if (milestoneQuery != '')
                    queryFilterArray.push(milestoneQuery);
                // for (var index = 0; index < milestonesToAdd.length; index++) {
                //     var milestoneValue = milestonesToAdd[index];
                //     milestoneQuery = _generateQueryForMilestones(milestoneValue, subQuery);
                //     if (milestoneQuery != '')
                //         queryFilterArray.push(milestoneQuery);
                // }
                // queryFilterArray = [
                //     '(((Project = "/project/c645c001-1c1e-4cd1-9217-ee2dbe2ace3b") OR (Project = "/project/c645c001-1c1e-4cd1-9217-ee2dbe2ace3b")) OR (Project = "/project/c645c001-1c1e-4cd1-9217-ee2dbe2ace3b"))',
                //     '(((((Project = "/project/897ee25d-1610-4efc-9651-0e8e9bd7f82c") OR (Project = "/project/1cfd4cf4-5bf7-476c-8c3d-f6a6b906a3b7")) OR (Project = "/project/c5577542-1677-44ea-acdc-555e9cb806fe")) OR (Project = "/project/7f99aaa6-d817-412c-acf7-d43076d0599b")) OR (Project = "/project/677aa9e3-d2ae-40ef-8a30-69abe2d3939b"))'
                // ]
                if (queryFilterArray.length == 0)
                {
                    if (queryFilters != '' &&  queryFilters != undefined)
                        queryFilters = queryFilters.slice(0, queryFilters.length - 4);  // remove 'AND'
                    queryFilters = ' ( FormattedID = 0 ) ';
                }else if (queryFilterArray.length == 1){
                    if (queryFilters == '' || queryFilters == undefined)
                    {
                        queryFilters = queryFilterArray[0];
                    }
                    else {
                        queryFilters = '(' + queryFilters + (queryFilters.slice(-1) == ')' ? ' AND ' : '') + queryFilterArray[0] + ')';
                    }
                } else{
                    var generatedQuery = queryFilterArray[queryFilterArray.length - 1];
                    for (var i = queryFilterArray.length - 2; i >= 0; i--) {
                        generatedQuery = '(' + queryFilterArray[i] + ' OR ' + generatedQuery + ')';
                    }
                    
                    if (queryFilters == '' || queryFilters == undefined)
                    {
                        queryFilters = generatedQuery;
                    }
                    else {
                        queryFilters = '(' + queryFilters + (queryFilters.slice(-1) == ')' ? ' AND ' : '') + generatedQuery + ')';
                    }
                }
                //milestonesToAdd
            }
            var startIndex = store.lastOptions.params.start;
            if (queryFilters != undefined && queryFilters != ""){
                var composedQuery =  queryFilters;
                Ext.apply(operation, {
                    params: {
                        query:composedQuery,
                        pagesize: pageSize,
                        start: startIndex,
                        types: typesForPortfolioItemType
                    }
               });
            }else{
                Ext.apply(operation, {
                    params: {
                        pagesize: pageSize,
                        start: startIndex,
                        types: typesForPortfolioItemType
                    }
               });
            }
        } else {
            Ext.apply(operation, {
                params: {
                    types: typesForPortfolioItemType,
                    pagesize: pageSize,
                    
                }
           });
        }
        // }
        

        // var myMask = new Ext.LoadMask(store.currentPanel, {msg:"Preparing queries..."});
        // myMask.show();
    
        // Ext.defer(function() {
            // _beforeLoadStoreFn();
        //     myMask.hide();
        // }, 1);
        return;
    },
    fetchWsapiRecords: function(config) {
        var deferred = Ext.create('Deft.Deferred');

        config.compact = false;
        config.limit = "Infinity";
        config.allowPostGet = true;

        var store = Ext.create('Rally.data.wsapi.Store', config);
        store.on('beforeload', this._beforeLoadStore);
        store.load({
            callback: function(records, operation) {
                if (operation.wasSuccessful()) {
                    deferred.resolve(records);
                }
                else {
                    deferred.reject('fetchWsapiRecords error: ' + operation.error.errors.join(','));
                }
            },
            scope: this
        });
        return deferred;
    },

    getChildFieldFor: function(parent_type, child_type) {
        if (parent_type.toLowerCase() === "hierarchicalrequirement" || parent_type.toLowerCase() === "userstory") {
            if (child_type.toLowerCase() == "task") { return 'Tasks'; }
            if (child_type.toLowerCase() == "defect") { return 'Defects'; }
            if (child_type.toLowerCase() == "testcase") { return 'TestCases'; }
            if (child_type.toLowerCase() == "hierarchicalrequirement") { return 'Children'; }
        }
        if (parent_type.toLowerCase() === "defect") {
            if (child_type.toLowerCase() == "task") { return 'Tasks'; }
            if (child_type.toLowerCase() == "testcase") { return 'TestCases'; }
        }
        if (parent_type.toLowerCase() === "testcase") {
            if (child_type.toLowerCase() == "defect") { return 'Defects'; }
        }
        if (/portfolioitem/.test(parent_type.toLowerCase())) {
            if (child_type.toLowerCase() == "hierarchicalrequirement") { return 'UserStories'; }
        }
        return null;
    },

    getParentFieldFor: function(child_type, parent_type) {
        if (parent_type.toLowerCase() === "hierarchicalrequirement" || parent_type.toLowerCase() === "userstory") {
            if (child_type.toLowerCase() == "task") { return 'WorkProduct'; }
            if (child_type.toLowerCase() == "defect") { return 'Requirement'; }
            if (child_type.toLowerCase() == "testcase") { return 'WorkProduct'; }
            if (child_type.toLowerCase() == "hierarchicalrequirement") { return 'Parent'; }
        }
        if (parent_type.toLowerCase() === "defect") {
            if (child_type.toLowerCase() == "task") { return 'WorkProduct'; }
            if (child_type.toLowerCase() == "testcase") { return 'WorkProduct'; }
        }
        if (parent_type.toLowerCase() === "testcase") {
            if (child_type.toLowerCase() == "defect") { return 'TestCase'; }
        }
        if (/portfolioitem/.test(parent_type.toLowerCase())) {
            if (child_type.toLowerCase() == "hierarchicalrequirement") { return 'PortfolioItem'; }
        }
        return null;

    },
    getAllowedChildTypes: function(type) {
        var allowed_types = [];
        var given_types = this.loadChildModels;

        if (type.toLowerCase() === this.storyModelName.toLowerCase()) {
            allowed_types = ['task', 'defect', 'testcase', this.storyModelName.toLowerCase()];
        }
        if (type.toLowerCase() === 'defect') {
            allowed_types = ['task', 'testcase'];
        }
        if (type.toLowerCase() === 'testcase') {
            allowed_types = ['defect'];
        }

        var types_in_both = Ext.Array.intersect(allowed_types, given_types);
        return types_in_both;
    },

    getRequiredFetchFields: function(type) {
        if (/^portfolioitem/.test(type.toLowerCase())) {
            return ['Children', 'LeafStoryCount', 'Parent', 'ObjectID', 'UserStories'];
        }

        if (type.toLowerCase() === this.storyModelName) {
            return ['FormattedID', 'Children', 'Tasks', 'Parent', 'PortfolioItem', 'HasParent', 'ObjectID', 'TestCases', 'Defects'];
        }

        return ['ObjectID', 'WorkProduct', 'Defects', 'Tasks', 'TestCases', 'Requirement', 'TestCase', 'FormattedID'];
    },
    throttle: function(fns, maxParallelCalls, scope) {

        if (maxParallelCalls <= 0 || fns.length < maxParallelCalls) {
            return Deft.promise.Chain.parallel(fns, scope);
        }


        var parallelFns = [],
            fnChunks = [],
            idx = -1;

        for (var i = 0; i < fns.length; i++) {
            if (i % maxParallelCalls === 0) {
                idx++;
                fnChunks[idx] = [];
            }
            fnChunks[idx].push(fns[i]);
        }

        _.each(fnChunks, function(chunk) {
            parallelFns.push(function() {
                return Deft.promise.Chain.parallel(chunk, scope);
            });
        });

        return Deft.Promise.reduce(parallelFns, function(groupResults, fnGroup) {
            return Deft.Promise.when(fnGroup.call(scope)).then(function(results) {
                groupResults = groupResults.concat(results || []);
                return groupResults;
            });
        }, []);
    }

});
